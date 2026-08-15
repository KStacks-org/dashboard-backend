import { Router } from "express";
import * as notificationController from "@/controllers/notification.controller.js";

export const notificationRouter = Router();

notificationRouter.get("/", notificationController.list);
// Long-lived SSE connection; declared before any "/:id" pattern.
notificationRouter.get("/stream", notificationController.stream);
notificationRouter.post("/read-all", notificationController.markAllRead);
notificationRouter.post("/:id/read", notificationController.markRead);
