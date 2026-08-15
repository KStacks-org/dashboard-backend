import { UnauthorizedError } from "@/errors/AppError.js";
import { notificationBus } from "@/lib/notificationBus.js";
import * as notificationService from "@/services/notification.service.js";
import { asyncHandler } from "@/utils/asyncHandler.js";
import { uuidParamSchema } from "@/validation/common.schema.js";

export const list = asyncHandler(async (req, res) => {
  if (!req.user) throw new UnauthorizedError();
  const [notifications, unread] = await Promise.all([
    notificationService.listNotifications(req.user.id),
    notificationService.countUnread(req.user.id),
  ]);
  res.json({ notifications, unread });
});

export const markRead = asyncHandler(async (req, res) => {
  if (!req.user) throw new UnauthorizedError();
  const { id } = uuidParamSchema.parse(req.params);
  await notificationService.markRead(id, req.user.id);
  res.status(204).send();
});

export const markAllRead = asyncHandler(async (req, res) => {
  if (!req.user) throw new UnauthorizedError();
  await notificationService.markAllRead(req.user.id);
  res.status(204).send();
});

/**
 * Server-sent events stream: the browser holds this open and the server pushes
 * each new notification down it, so an open tab updates without polling.
 *
 * SSE rather than a WebSocket because the traffic is one-way and it rides on
 * the existing session cookie with no extra handshake or auth path.
 */
export function stream(req: import("express").Request, res: import("express").Response) {
  if (!req.user) {
    res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    // Stops a reverse proxy from buffering the stream into uselessness.
    "X-Accel-Buffering": "no",
  });
  res.write("retry: 5000\n\n");

  const send = (payload: unknown) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  const unsubscribe = notificationBus.subscribe(req.user.id, send);

  // Comment frames keep intermediaries from closing an idle connection.
  const heartbeat = setInterval(() => res.write(": ping\n\n"), 25_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
    res.end();
  });
}
