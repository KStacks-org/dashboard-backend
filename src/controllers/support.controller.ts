import type { Request, Response } from "express";
import { z } from "zod";
import { UnauthorizedError } from "@/errors/AppError.js";
import { notificationBus } from "@/lib/notificationBus.js";
import * as supportService from "@/services/support.service.js";
import { asyncHandler } from "@/utils/asyncHandler.js";
import { uuidParamSchema } from "@/validation/common.schema.js";
import {
  addReporterMessageSchema,
  addStaffReplySchema,
  createConversationSchema,
} from "@/validation/support.schema.js";

const tokenParamSchema = z.object({ token: z.string().uuid("Invalid token") });
const listQuerySchema = z.object({ status: z.enum(["OPEN", "CLOSED"]).optional() });
const setStatusSchema = z.object({ status: z.enum(["OPEN", "CLOSED"]) });

// ---- Public: called by the widget, no session, cross-origin ----

export const create = asyncHandler(async (req, res) => {
  const input = createConversationSchema.parse(req.body);
  const conversation = await supportService.createConversation(input);
  res.status(201).json({ conversation });
});

export const getByToken = asyncHandler(async (req, res) => {
  const { token } = tokenParamSchema.parse(req.params);
  const conversation = await supportService.getConversationByToken(token);
  res.json({ conversation });
});

export const addReporterMessage = asyncHandler(async (req, res) => {
  const { token } = tokenParamSchema.parse(req.params);
  const input = addReporterMessageSchema.parse(req.body);
  const conversation = await supportService.addReporterMessage(token, input);
  res.status(201).json({ conversation });
});

/**
 * The reporter's live-update stream, keyed by their token rather than a user
 * id — the same SSE pattern notification.controller.ts uses for staff, just
 * with no session in the way of who is allowed to listen.
 */
export const reporterStream = asyncHandler(async (req: Request, res: Response) => {
  const { token } = tokenParamSchema.parse(req.params);
  const conversationId = await supportService.conversationIdForToken(token);

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write("retry: 5000\n\n");

  const send = (payload: unknown) => res.write(`data: ${JSON.stringify(payload)}\n\n`);
  const unsubscribe = notificationBus.subscribe(supportService.channelFor(conversationId), send);
  const heartbeat = setInterval(() => res.write(": ping\n\n"), 25_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
    res.end();
  });
});

// ---- Protected: dashboard team members only, mounted under the session-authenticated router ----

export const list = asyncHandler(async (req, res) => {
  if (!req.user) throw new UnauthorizedError();
  const { status } = listQuerySchema.parse(req.query);
  const conversations = await supportService.listConversations(status);
  res.json({ conversations });
});

export const getOne = asyncHandler(async (req, res) => {
  if (!req.user) throw new UnauthorizedError();
  const { id } = uuidParamSchema.parse(req.params);
  const conversation = await supportService.getConversation(id);
  res.json({ conversation });
});

export const reply = asyncHandler(async (req, res) => {
  if (!req.user) throw new UnauthorizedError();
  const { id } = uuidParamSchema.parse(req.params);
  const input = addStaffReplySchema.parse(req.body);
  const conversation = await supportService.addStaffReply(id, req.user.id, input);
  res.status(201).json({ conversation });
});

export const setStatus = asyncHandler(async (req, res) => {
  if (!req.user) throw new UnauthorizedError();
  const { id } = uuidParamSchema.parse(req.params);
  const { status } = setStatusSchema.parse(req.body);
  const conversation = await supportService.setConversationStatus(id, status, req.user.id);
  res.json({ conversation });
});

/**
 * Staff SSE stream for the support inbox, keyed by the caller's own user id —
 * distinct from notification.controller.ts's stream so a reply doesn't have
 * to masquerade as a generic Notification row.
 */
export function staffStream(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write("retry: 5000\n\n");

  const send = (payload: unknown) => res.write(`data: ${JSON.stringify(payload)}\n\n`);
  // Every open conversation's channel is namespaced `support:<id>`, unknown to
  // a staff listener up front — staff instead get a broadcast on this fixed
  // channel whenever any conversation changes, and refetch the list.
  const unsubscribe = notificationBus.subscribe("support:inbox", send);
  const heartbeat = setInterval(() => res.write(": ping\n\n"), 25_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
    res.end();
  });
}
