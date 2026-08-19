import { Router } from "express";
import * as supportController from "@/controllers/support.controller.js";
import { supportCreateRateLimiter, supportRateLimiter } from "@/middleware/rateLimiters.js";

/**
 * Called by the embedded widget on the KStack service sites — no session,
 * cross-origin. Mounted in app.ts with its own CORS policy (publicSupportCors)
 * and ahead of the session/CSRF stack the rest of the API sits behind.
 */
export const publicSupportRouter = Router();
publicSupportRouter.use(supportRateLimiter);

publicSupportRouter.post("/conversations", supportCreateRateLimiter, supportController.create);
publicSupportRouter.get("/conversations/:token", supportController.getByToken);
publicSupportRouter.post("/conversations/:token/messages", supportController.addReporterMessage);
publicSupportRouter.get("/conversations/:token/stream", supportController.reporterStream);

/** Mounted inside the dashboard's normal session-authenticated router. */
export const supportRouter = Router();
supportRouter.get("/stream", supportController.staffStream);
supportRouter.get("/", supportController.list);
supportRouter.get("/:id", supportController.getOne);
supportRouter.post("/:id/reply", supportController.reply);
supportRouter.patch("/:id/status", supportController.setStatus);
