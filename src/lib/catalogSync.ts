/**
 * Keeps the local `services` table in step with the live kstacks.org catalogue.
 *
 * kstacks.org server-renders its "Official Stack Services" grid, so a plain HTTP
 * fetch is enough — no headless browser needed. The parsing lives here rather
 * than in the maintenance script so the scheduler and the CLI run the exact same
 * code; the script is now only a wrapper that prints the result.
 *
 * If the markup changes shape and nothing can be parsed, the sync throws WITHOUT
 * writing, so a site redesign can never wipe or corrupt the table.
 */
import { env } from "@/config/env.js";
import { prisma } from "@/lib/prisma.js";

export type ScrapedService = {
  name: string;
  codename: string;
  tagline: string;
  description: string;
  status: "LIVE" | "BETA" | "COMING_SOON";
  url: string | null;
  logoUrl: string | null;
};

export class CatalogParseError extends Error {}

/**
 * Each service is one `<a>` card containing, in order: href, optional status
 * badge, logo, name, tagline, description. Splitting on the anchor boundary
 * keeps the badge inside the same chunk as its service — the badge sits *above*
 * the logo in the markup, so anchoring on the logo alone would miss it.
 *
 * Codename comes from the logo asset path (`/projects/kindex-light.svg`), the
 * most stable identifier on the page — it survives copy edits to names/taglines.
 */
export function parseServices(html: string, baseUrl: string): ScrapedService[] {
  const services: ScrapedService[] = [];
  const seen = new Set<string>();

  for (const chunk of html.split(/(?=<a\s)/i)) {
    const logoMatch = /\/projects\/([A-Za-z]+)-(?:light|dark)\.svg/i.exec(chunk);
    if (!logoMatch?.[1]) continue;

    const asset = logoMatch[1];
    const codename = asset.toLowerCase();
    // "kstack" is the portal's own mark, not a service in the catalogue.
    if (codename === "kstack" || seen.has(codename)) continue;

    const textMatch =
      /<h3[^>]*>([^<]+)<\/h3>[\s\S]{0,400}?<p[^>]*>([^<]+)<\/p>[\s\S]{0,400}?<p[^>]*>([^<]+)<\/p>/i.exec(
        chunk,
      );
    if (!textMatch) continue;

    const [, name, tagline, description] = textMatch;
    if (!name || !tagline || !description) continue;

    seen.add(codename);

    const status = readStatus(chunk);
    const linkMatch = /href="(https?:\/\/[^"]+)"/i.exec(chunk);

    services.push({
      name: decodeEntities(name.trim()),
      codename,
      tagline: decodeEntities(tagline.trim()),
      description: decodeEntities(description.trim()),
      status,
      url: status === "COMING_SOON" ? null : (linkMatch?.[1] ?? null),
      // The asset name keeps its upstream casing ("KGPA"), which the codename
      // deliberately loses. The dark variant is the one drawn for a dark ground.
      logoUrl: absoluteUrl(`/projects/${asset}-dark.svg`, baseUrl),
    });
  }

  return services;
}

/**
 * Reads the card's status from its *visible* badge.
 *
 * Cards can carry a badge that is present in the DOM but hidden with a `hidden`
 * class (the live Grades card ships a hidden "Beta" badge this way), so a naive
 * text search would mislabel a live service. Badges whose wrapper is hidden are
 * ignored; the disabled "Under Development" CTA is a second, independent signal.
 */
function readStatus(chunk: string): ScrapedService["status"] {
  const visibleBadges: string[] = [];
  const badgePattern = /<div class="([^"]*)"[^>]*>\s*<span[^>]*>([^<]+)<\/span>\s*<\/div>/gi;

  for (const badge of chunk.matchAll(badgePattern)) {
    const [, className, label] = badge;
    if (!className || !label) continue;
    if (/\bhidden\b/.test(className)) continue;
    visibleBadges.push(label.trim());
  }

  if (visibleBadges.some((label) => /coming\s*soon/i.test(label))) return "COMING_SOON";
  if (/Under\s*Development/i.test(chunk)) return "COMING_SOON";
  if (visibleBadges.some((label) => /^beta$/i.test(label))) return "BETA";
  return "LIVE";
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)));
}

function absoluteUrl(path: string, baseUrl: string): string | null {
  try {
    return new URL(path, baseUrl).toString();
  } catch {
    return null;
  }
}

export async function fetchCatalog(url = env.SERVICE_CATALOG_URL): Promise<ScrapedService[]> {
  const response = await fetch(url, {
    headers: { "User-Agent": "KStacks-Dashboard-ServiceSync/1.0" },
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    throw new CatalogParseError(`Catalogue fetch failed with HTTP ${response.status}`);
  }

  const services = parseServices(await response.text(), url);

  if (services.length === 0) {
    throw new CatalogParseError(
      "Parsed 0 services — the page markup has probably changed. " +
        "Update the selectors in backend/src/lib/catalogSync.ts, then re-run.",
    );
  }

  return services;
}

/**
 * Writes the parsed catalogue to the database.
 *
 * Only the public catalogue fields are touched. The team-authored ones
 * (overview, repoUrl, healthCheckUrl, owner) are never in the update, so a sync
 * can never overwrite what someone wrote here. Services that vanish upstream are
 * kept, not deleted — existing tasks still reference them, and a transient parse
 * miss should never orphan real data.
 */
export async function writeCatalog(services: ScrapedService[]): Promise<number> {
  let index = 0;
  for (const service of services) {
    index += 1;
    await prisma.service.upsert({
      where: { codename: service.codename },
      update: { ...service, sortOrder: index },
      create: { ...service, sortOrder: index },
    });
  }
  return services.length;
}

export async function syncServiceCatalog(url = env.SERVICE_CATALOG_URL): Promise<number> {
  return writeCatalog(await fetchCatalog(url));
}
