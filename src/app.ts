import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { env, isProduction } from "@/config/env.js";
import * as authController from "@/controllers/auth.controller.js";
import { logger } from "@/lib/logger.js";
import { attachUser, requireAuth } from "@/middleware/auth.js";
import { verifyCsrf } from "@/middleware/csrf.js";
import { errorHandler, notFoundHandler } from "@/middleware/errorHandler.js";
import { publicSupportCors } from "@/middleware/publicCors.js";
import { apiRateLimiter } from "@/middleware/rateLimiters.js";
import { authRouter } from "@/routes/auth.routes.js";
import { commentRouter } from "@/routes/comment.routes.js";
import { issueRouter } from "@/routes/issue.routes.js";
import { linkRouter } from "@/routes/link.routes.js";
import { milestoneRouter } from "@/routes/milestone.routes.js";
import { notificationRouter } from "@/routes/notification.routes.js";
import { githubRouter, overviewRouter } from "@/routes/overview.routes.js";
import { serviceRouter } from "@/routes/service.routes.js";
import { sponsoredProjectRouter } from "@/routes/sponsoredProject.routes.js";
import { subtaskRouter } from "@/routes/subtask.routes.js";
import { publicSupportRouter, supportRouter } from "@/routes/support.routes.js";
import { taskRouter } from "@/routes/task.routes.js";
import { teamRouter } from "@/routes/team.routes.js";
import { userRouter } from "@/routes/user.routes.js";

export function createApp() {
  const app = express();

  if (isProduction) app.set("trust proxy", 1);

  app.use(helmet());
  app.use(express.json({ limit: "1mb" }));
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === "/health" } }));

  app.use(cookieParser());
  app.use(attachUser);

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  // Published at the conventional path so a verifying library can find it by
  // convention. Public and unauthenticated: it carries only the public key.
  app.get("/.well-known/jwks.json", authController.jwks);

  // The one policy every cookie-authenticated route shares: a single trusted
  // origin, cookies included. Scoped to just these two mounts rather than
  // applied blanket — a blanket `app.use(cors(...))` would answer every
  // route's CORS preflight, including the public support router below, whose
  // preflight needs a completely different (multi-origin, cookie-less) answer.
  const dashboardCors = cors({ origin: env.FRONTEND_URL, credentials: true });

  // No session, called cross-origin from the KStack service sites' embedded
  // widget — its own CORS policy, mounted ahead of anything session-shaped.
  app.use("/api/public/support", publicSupportCors, publicSupportRouter);

  app.use("/api/auth", dashboardCors, authRouter);

  const protectedRouter = express.Router();
  protectedRouter.use(dashboardCors, apiRateLimiter, requireAuth, verifyCsrf);
  protectedRouter.use("/services", serviceRouter);
  protectedRouter.use("/users", userRouter);
  protectedRouter.use("/tasks", taskRouter);
  protectedRouter.use("/subtasks", subtaskRouter);
  protectedRouter.use("/comments", commentRouter);
  protectedRouter.use("/links", linkRouter);
  protectedRouter.use("/sponsored-projects", sponsoredProjectRouter);
  protectedRouter.use("/overview", overviewRouter);
  protectedRouter.use("/team", teamRouter);
  protectedRouter.use("/issues", issueRouter);
  protectedRouter.use("/milestones", milestoneRouter);
  protectedRouter.use("/notifications", notificationRouter);
  protectedRouter.use("/github", githubRouter);
  protectedRouter.use("/support", supportRouter);
  app.use("/api", protectedRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
