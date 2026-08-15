import { afterAll, describe, expect, it } from "vitest";
import { parseServices, writeCatalog } from "@/lib/catalogSync.js";
import { prisma } from "@/lib/prisma.js";

const BASE = "https://kstacks.org/";

/**
 * A trimmed copy of the real markup shape: one live card, one card whose "Beta"
 * badge is present but hidden, one "Coming Soon", and the portal's own mark
 * which is not a service. Kept as a fixture so these tests never touch the
 * network and cannot fail because the site is down.
 */
const FIXTURE = `
<a href="https://index.kstacks.org/">
  <img src="/projects/kindex-light.svg" />
  <h3>Index</h3><p>Course &amp; Section Search</p><p>Find courses and sections</p>
</a>
<a href="https://gpa.kstacks.org/">
  <div class="badge hidden"><span>Beta</span></div>
  <img src="/projects/KGPA-light.svg" />
  <h3>Grades</h3><p>GPA Calculator</p><p>Calculate your GPA</p>
</a>
<a href="https://subjects.kstacks.org/">
  <div class="badge"><span>Coming Soon</span></div>
  <img src="/projects/ksubjects-light.svg" />
  <h3>Subjects</h3><p>Subject Explorer</p><p>Explore subjects</p>
</a>
<a href="https://kstacks.org/">
  <img src="/projects/kstack-light.svg" />
  <h3>KStack</h3><p>Portal</p><p>The portal itself</p>
</a>
`;

describe("service catalogue parser", () => {
  const parsed = parseServices(FIXTURE, BASE);

  it("skips the portal's own mark, which is not a service", () => {
    expect(parsed.map((s) => s.codename)).toEqual(["kindex", "kgpa", "ksubjects"]);
  });

  it("captures an absolute URL for the dark logo variant, preserving upstream casing", () => {
    const grades = parsed.find((s) => s.codename === "kgpa");
    // The codename lowercases "KGPA"; the asset path must not.
    expect(grades?.logoUrl).toBe("https://kstacks.org/projects/KGPA-dark.svg");
    expect(parsed[0]?.logoUrl).toBe("https://kstacks.org/projects/kindex-dark.svg");
  });

  it("ignores a badge that is in the DOM but hidden", () => {
    // Grades ships a hidden "Beta" badge while being live; a naive text search
    // would mislabel it.
    expect(parsed.find((s) => s.codename === "kgpa")?.status).toBe("LIVE");
  });

  it("reads a visible Coming Soon badge and drops the link", () => {
    const subjects = parsed.find((s) => s.codename === "ksubjects");
    expect(subjects?.status).toBe("COMING_SOON");
    expect(subjects?.url).toBeNull();
  });

  it("returns nothing rather than guessing when the markup changes shape", () => {
    expect(parseServices("<main><div>redesigned</div></main>", BASE)).toEqual([]);
  });
});

describe("service catalogue write", () => {
  const codename = "ksynctest";

  afterAll(async () => {
    await prisma.service.deleteMany({ where: { codename } });
  });

  it("creates a service that only exists upstream, logo included", async () => {
    await writeCatalog([
      {
        name: "Sync Test",
        codename,
        tagline: "Tagline",
        description: "Description",
        status: "LIVE",
        url: "https://example.com/",
        logoUrl: "https://kstacks.org/projects/ksynctest-dark.svg",
      },
    ]);

    const created = await prisma.service.findUnique({ where: { codename } });
    expect(created?.name).toBe("Sync Test");
    expect(created?.logoUrl).toBe("https://kstacks.org/projects/ksynctest-dark.svg");
  });

  it("refreshes public fields but never overwrites what the team wrote", async () => {
    await prisma.service.update({
      where: { codename },
      data: {
        overview: "Team-authored overview",
        repoUrl: "https://github.com/KStacks-org/example",
        healthCheckUrl: "https://example.com/health",
      },
    });

    await writeCatalog([
      {
        name: "Sync Test Renamed",
        codename,
        tagline: "New tagline",
        description: "New description",
        status: "BETA",
        url: "https://example.com/",
        logoUrl: "https://kstacks.org/projects/ksynctest-dark.svg",
      },
    ]);

    const after = await prisma.service.findUnique({ where: { codename } });
    expect(after?.name).toBe("Sync Test Renamed");
    expect(after?.status).toBe("BETA");
    expect(after?.overview).toBe("Team-authored overview");
    expect(after?.repoUrl).toBe("https://github.com/KStacks-org/example");
    expect(after?.healthCheckUrl).toBe("https://example.com/health");
  });
});
