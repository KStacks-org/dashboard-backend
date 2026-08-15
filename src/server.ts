import { createApp } from "@/app.js";
import { env } from "@/config/env.js";
import { startHealthScheduler, stopHealthScheduler } from "@/lib/healthScheduler.js";
import { logger } from "@/lib/logger.js";
import { prisma } from "@/lib/prisma.js";

async function main() {
  await prisma.$connect();
  logger.info("Connected to PostgreSQL");

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`KStacks Dashboard API listening on ${env.APP_URL} (port ${env.PORT})`);
  });

  startHealthScheduler();

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    stopHealthScheduler();
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error) => {
  console.error("Fatal startup error:", error);
  process.exit(1);
});
