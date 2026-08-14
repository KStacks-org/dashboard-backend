import cors from "cors";
import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { env, isProduction } from "@/config/env.js";
import { logger } from "@/lib/logger.js";
import { attachUser, blockIfMustChangePassword, requireAuth } from "@/middleware/auth.js";
import { verifyCsrf } from "@/middleware/csrf.js";
import { errorHandler, notFoundHandler } from "@/middleware/errorHandler.js";
import { apiRateLimiter } from "@/middleware/rateLimiters.js";
import { sessionMiddleware } from "@/middleware/session.js";
import { authRouter } from "@/routes/auth.routes.js";
import { serviceRouter } from "@/routes/service.routes.js";
import { subtaskRouter } from "@/routes/subtask.routes.js";
import { taskRouter } from "@/routes/task.routes.js";
import { userRouter } from "@/routes/user.routes.js";

export function createApp() {
  const app = express();

  if (isProduction) app.set("trust proxy", 1);

  app.use(helmet());
  app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === "/health" } }));

  app.use(sessionMiddleware);
  app.use(attachUser);

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  app.use("/api/auth", authRouter);

  const protectedRouter = express.Router();
  protectedRouter.use(apiRateLimiter, requireAuth, blockIfMustChangePassword, verifyCsrf);
  protectedRouter.use("/services", serviceRouter);
  protectedRouter.use("/users", userRouter);
  protectedRouter.use("/tasks", taskRouter);
  protectedRouter.use("/subtasks", subtaskRouter);
  app.use("/api", protectedRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
