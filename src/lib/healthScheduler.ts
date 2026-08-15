import { env } from "@/config/env.js";
import { logger } from "@/lib/logger.js";
import { runHealthChecks } from "@/services/health.service.js";

let timer: NodeJS.Timeout | null = null;
let running = false;

/**
 * Periodically probes the services that have a health URL configured.
 *
 * Runs in-process because six probes every few minutes does not justify a
 * separate worker. Overlapping runs are skipped rather than queued, and every
 * failure is swallowed after logging so a bad probe can never crash the API.
 */
export function startHealthScheduler() {
  if (!env.HEALTH_CHECK_ENABLED) {
    logger.info("Health checks are disabled (HEALTH_CHECK_ENABLED=false)");
    return;
  }

  const intervalMs = env.HEALTH_CHECK_INTERVAL_MINUTES * 60 * 1000;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const checked = await runHealthChecks();
      if (checked > 0) logger.debug({ checked }, "Health checks completed");
    } catch (error) {
      logger.error({ err: error }, "Health check run failed");
    } finally {
      running = false;
    }
  };

  void tick();
  timer = setInterval(() => void tick(), intervalMs);
  // Never hold the process open just for the scheduler.
  timer.unref();

  logger.info(`Health checks scheduled every ${env.HEALTH_CHECK_INTERVAL_MINUTES} minute(s)`);
}

export function stopHealthScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}
