import { env } from "@/config/env.js";
import { CatalogParseError, syncServiceCatalog } from "@/lib/catalogSync.js";
import { logger } from "@/lib/logger.js";

let timer: NodeJS.Timeout | null = null;
let running = false;

/**
 * Periodically refreshes the service catalogue from kstacks.org, so a service
 * launched there shows up here without anyone running a script.
 *
 * Deliberately infrequent — the catalogue changes a few times a year, not a few
 * times an hour. Overlapping runs are skipped, and every failure is logged and
 * swallowed: an unreachable site or a redesigned page leaves the existing rows
 * untouched rather than taking the API down with it.
 */
export function startCatalogScheduler() {
  if (!env.SERVICE_SYNC_ENABLED) {
    logger.info("Service catalogue sync is disabled (SERVICE_SYNC_ENABLED=false)");
    return;
  }

  const intervalMs = env.SERVICE_SYNC_INTERVAL_HOURS * 60 * 60 * 1000;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const synced = await syncServiceCatalog();
      logger.debug({ synced }, "Service catalogue synced");
    } catch (error) {
      // A parse failure means the page changed shape and needs a human; anything
      // else is usually the network. Neither is worth crashing for.
      const message =
        error instanceof CatalogParseError
          ? "Service catalogue sync parsed nothing — check the selectors"
          : "Service catalogue sync failed";
      logger.error({ err: error }, message);
    } finally {
      running = false;
    }
  };

  void tick();
  timer = setInterval(() => void tick(), intervalMs);
  // Never hold the process open just for the scheduler.
  timer.unref();

  logger.info(`Service catalogue sync scheduled every ${env.SERVICE_SYNC_INTERVAL_HOURS} hour(s)`);
}

export function stopCatalogScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}
