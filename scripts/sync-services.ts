/**
 * Refreshes the local `services` table from the live kstacks.org catalogue.
 *
 * The API also does this on a schedule (SERVICE_SYNC_INTERVAL_HOURS), so this
 * script exists for when you want it *now* or want to preview what would change.
 * The parsing and writing live in src/lib/catalogSync.ts — both paths run the
 * same code, so a fix here can never drift from what the server does.
 *
 *   pnpm --filter backend db:sync-services            # apply changes
 *   pnpm --filter backend db:sync-services --dry-run  # preview only
 */
import { env } from "@/config/env.js";
import { fetchCatalog, writeCatalog } from "@/lib/catalogSync.js";
import { prisma } from "@/lib/prisma.js";

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  console.log(`Fetching ${env.SERVICE_CATALOG_URL} ...`);
  const services = await fetchCatalog();

  console.log(`Parsed ${services.length} services:`);
  for (const service of services) {
    console.log(
      `  - ${service.name} (${service.codename}) [${service.status}] ${service.logoUrl ?? "no logo"}`,
    );
  }

  if (dryRun) {
    console.log("\nDry run — no database changes were written.");
    return;
  }

  const synced = await writeCatalog(services);
  console.log(`\nSynced ${synced} services into PostgreSQL.`);
}

main()
  .catch((error) => {
    console.error("Service sync failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
