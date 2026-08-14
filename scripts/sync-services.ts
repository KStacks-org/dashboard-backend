/**
 * Refreshes the local `services` table from the live kstacks.org service catalog.
 *
 * kstacks.org server-renders its "Official Stack Services" grid, so a plain HTTP
 * fetch is enough — no headless browser needed. This is a maintenance script run
 * on demand (or from cron); normal dashboard page loads never touch the network.
 *
 *   pnpm --filter backend db:sync-services            # apply changes
 *   pnpm --filter backend db:sync-services --dry-run  # preview only
 *
 * If the markup changes shape and no services can be parsed, the script exits
 * non-zero WITHOUT writing anything, so a site redesign can never wipe the table.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SOURCE_URL = "https://kstacks.org/";

type ScrapedService = {
  name: string;
  codename: string;
  tagline: string;
  description: string;
  status: "LIVE" | "BETA" | "COMING_SOON";
  url: string | null;
};

/**
 * Each service is one `<a>` card containing, in order: href, optional status
 * badge, logo, name, tagline, description. Splitting on the anchor boundary
 * keeps the badge inside the same chunk as its service — the badge sits *above*
 * the logo in the markup, so anchoring on the logo alone would miss it.
 *
 * Codename comes from the logo asset path (`/projects/kindex-light.svg`), the
 * most stable identifier on the page — it survives copy edits to names/taglines.
 */
function parseServices(html: string): ScrapedService[] {
  const services: ScrapedService[] = [];
  const seen = new Set<string>();

  for (const chunk of html.split(/(?=<a\s)/i)) {
    const logoMatch = /\/projects\/([A-Za-z]+)-(?:light|dark)\.svg/i.exec(chunk);
    if (!logoMatch?.[1]) continue;

    const codename = logoMatch[1].toLowerCase();
    // "kstack" is the portal's own mark, not a service in the catalog.
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

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  console.log(`Fetching ${SOURCE_URL} ...`);
  const response = await fetch(SOURCE_URL, {
    headers: { "User-Agent": "KStacks-Dashboard-ServiceSync/1.0" },
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    console.error(`Fetch failed with HTTP ${response.status}. Nothing was changed.`);
    process.exit(1);
  }

  const services = parseServices(await response.text());

  if (services.length === 0) {
    console.error(
      "Parsed 0 services — the page markup has probably changed. Nothing was changed.\n" +
        "Update the selectors in backend/scripts/sync-services.ts, then re-run.",
    );
    process.exit(1);
  }

  console.log(`Parsed ${services.length} services:`);
  for (const service of services) {
    console.log(`  - ${service.name} (${service.codename}) [${service.status}]`);
  }

  if (dryRun) {
    console.log("\nDry run — no database changes were written.");
    return;
  }

  let index = 0;
  for (const service of services) {
    index += 1;
    await prisma.service.upsert({
      where: { codename: service.codename },
      update: { ...service, sortOrder: index },
      create: { ...service, sortOrder: index },
    });
  }

  // Services that vanish upstream are kept, not deleted — existing tasks still
  // reference them, and a transient parse miss should never orphan real data.
  console.log(`\nSynced ${services.length} services into PostgreSQL.`);
}

main()
  .catch((error) => {
    console.error("Service sync failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
