import { BadRequestError, ConflictError, NotFoundError } from "@/errors/AppError.js";
import { notifyReporterOfReply } from "@/lib/emailNotifier.js";
import { notificationBus } from "@/lib/notificationBus.js";
import { prisma } from "@/lib/prisma.js";
import type {
  AddReporterMessageInput,
  AddStaffReplyInput,
  CreateConversationInput,
} from "@/validation/support.schema.js";

const staffSelect = { id: true, displayName: true } as const;

const conversationInclude = {
  messages: {
    orderBy: { createdAt: "asc" as const },
    include: { staff: { select: staffSelect } },
  },
  closedBy: { select: staffSelect },
};

/** The channel one conversation's own updates are published on — namespaced so it can never collide with a dashboard user's notification channel, which is keyed by a bare user id on the same bus. */
function channelFor(conversationId: string) {
  return `support:${conversationId}`;
}

/**
 * The fixed channel the staff inbox list listens on, separate from any one
 * conversation's channel — several team members can have the list open at
 * once, before any of them has a particular thread open to target.
 */
const INBOX_CHANNEL = "support:inbox";

function broadcastInboxChange() {
  notificationBus.publish(INBOX_CHANNEL, { type: "inbox-changed" });
}

export async function createConversation(input: CreateConversationInput) {
  const conversation = await prisma.supportConversation.create({
    data: {
      serviceCodename: input.serviceCodename,
      pageContext: input.pageContext,
      reporterName: input.reporterName,
      reporterEmail: input.reporterEmail,
      messages: { create: [{ senderType: "REPORTER", body: input.body }] },
    },
    include: conversationInclude,
  });
  broadcastInboxChange();
  return conversation;
}

/** Looked up by the reporter's own token — there is no other identity on their side. */
export async function getConversationByToken(token: string) {
  const conversation = await prisma.supportConversation.findUnique({
    where: { token },
    include: conversationInclude,
  });
  if (!conversation) throw new NotFoundError("Conversation not found");
  return conversation;
}

/**
 * A closed conversation is done, from the reporter's side: staff resolved it,
 * and the widget drops its saved token the moment it learns that, so there is
 * nothing left pointing back at this thread for them to write into. A new
 * problem is a new report — the 409 here is what tells a stale tab (one that
 * still had the thread open when it got closed) to do the same.
 */
export async function addReporterMessage(token: string, input: AddReporterMessageInput) {
  const conversation = await prisma.supportConversation.findUnique({
    where: { token },
    select: { id: true, status: true },
  });
  if (!conversation) throw new NotFoundError("Conversation not found");
  if (conversation.status === "CLOSED") {
    throw new ConflictError("This report has been closed. Send a new report to reach us.");
  }

  await prisma.supportMessage.create({
    data: { conversationId: conversation.id, senderType: "REPORTER", body: input.body },
  });
  const updated = await prisma.supportConversation.update({
    where: { id: conversation.id },
    data: { updatedAt: new Date() },
    include: conversationInclude,
  });

  notificationBus.publish(channelFor(conversation.id), { type: "message", conversation: updated });
  broadcastInboxChange();
  return updated;
}

export async function listConversations(status?: "OPEN" | "CLOSED") {
  return prisma.supportConversation.findMany({
    where: status ? { status } : undefined,
    orderBy: { updatedAt: "desc" },
    include: {
      messages: { orderBy: { createdAt: "desc" as const }, take: 1 },
    },
  });
}

export async function getConversation(id: string) {
  const conversation = await prisma.supportConversation.findUnique({
    where: { id },
    include: conversationInclude,
  });
  if (!conversation) throw new NotFoundError("Conversation not found");
  return conversation;
}

export async function addStaffReply(id: string, staffId: string, input: AddStaffReplyInput) {
  const conversation = await prisma.supportConversation.findUnique({
    where: { id },
    select: { id: true, token: true, reporterName: true, reporterEmail: true },
  });
  if (!conversation) throw new NotFoundError("Conversation not found");

  const [, updated] = await prisma.$transaction([
    prisma.supportMessage.create({
      data: {
        conversationId: id,
        senderType: "STAFF",
        staffId,
        asOrg: input.asOrg,
        body: input.body,
      },
    }),
    prisma.supportConversation.update({
      where: { id },
      data: { updatedAt: new Date() },
      include: conversationInclude,
    }),
  ]);

  notificationBus.publish(channelFor(id), { type: "message", conversation: updated });
  broadcastInboxChange();
  notifyReporterOfReply({
    reporterEmail: conversation.reporterEmail,
    reporterName: conversation.reporterName,
    conversationToken: conversation.token,
  });
  return updated;
}

export async function setConversationStatus(
  id: string,
  status: "OPEN" | "CLOSED",
  staffId: string,
) {
  const conversation = await prisma.supportConversation.findUnique({
    where: { id },
    select: { status: true },
  });
  if (!conversation) throw new NotFoundError("Conversation not found");
  if (conversation.status === status) {
    throw new BadRequestError(`Conversation is already ${status.toLowerCase()}`);
  }

  const updated = await prisma.supportConversation.update({
    where: { id },
    data:
      status === "CLOSED"
        ? { status, closedAt: new Date(), closedById: staffId }
        : { status, closedAt: null, closedById: null },
    include: conversationInclude,
  });

  notificationBus.publish(channelFor(id), { type: "status", conversation: updated });
  broadcastInboxChange();
  return updated;
}

/** For the reporter's own SSE stream, which subscribes by token rather than a user id. */
export async function conversationIdForToken(token: string): Promise<string> {
  const conversation = await prisma.supportConversation.findUnique({
    where: { token },
    select: { id: true },
  });
  if (!conversation) throw new NotFoundError("Conversation not found");
  return conversation.id;
}

export { channelFor };
