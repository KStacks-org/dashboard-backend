import type { NotificationType } from "@prisma/client";
import { NotFoundError } from "@/errors/AppError.js";
import { notificationBus } from "@/lib/notificationBus.js";
import { prisma } from "@/lib/prisma.js";

const notificationInclude = {
  actor: { select: { id: true, displayName: true } },
  task: { select: { id: true, reference: true, title: true } },
  issue: { select: { id: true, reference: true, title: true } },
};

type CreateNotification = {
  userId: string;
  type: NotificationType;
  body: string;
  actorId?: string | null;
  taskId?: string | null;
  issueId?: string | null;
};

/**
 * Persists notifications and pushes them to any open stream.
 *
 * Never notifies someone about their own action, and silently drops duplicates
 * for the same recipient, so re-saving a task does not spam its assignees.
 */
export async function notify(entries: CreateNotification[]) {
  const wanted = entries.filter((entry) => entry.userId !== entry.actorId);
  if (wanted.length === 0) return [];

  const created = await Promise.all(
    wanted.map((entry) =>
      prisma.notification.create({
        data: {
          userId: entry.userId,
          type: entry.type,
          body: entry.body,
          actorId: entry.actorId ?? null,
          taskId: entry.taskId ?? null,
          issueId: entry.issueId ?? null,
        },
        include: notificationInclude,
      }),
    ),
  );

  for (const notification of created) {
    notificationBus.publish(notification.userId, notification);
  }
  return created;
}

export function listNotifications(userId: string) {
  return prisma.notification.findMany({
    where: { userId },
    include: notificationInclude,
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export function countUnread(userId: string) {
  return prisma.notification.count({ where: { userId, isRead: false } });
}

export async function markRead(id: string, userId: string) {
  // Scoped by userId so one person can never mark another's notification read.
  const result = await prisma.notification.updateMany({
    where: { id, userId },
    data: { isRead: true },
  });
  if (result.count === 0) throw new NotFoundError("Notification not found");
}

export async function markAllRead(userId: string) {
  await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  });
}

/** `@ahmed` / `@عبدالله` mentions resolved against the roster's display names. */
export async function findMentionedUsers(body: string): Promise<string[]> {
  const handles = [...body.matchAll(/@([\p{L}\p{N}._-]{2,60})/gu)].map((match) =>
    (match[1] ?? "").toLowerCase(),
  );
  if (handles.length === 0) return [];

  const members = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, displayName: true, email: true },
  });

  const matched = members.filter((member) => {
    const localPart = member.email.split("@")[0]?.toLowerCase() ?? "";
    const name = member.displayName.toLowerCase();
    return handles.some(
      (handle) =>
        handle === localPart ||
        handle === name.replace(/\s+/g, "") ||
        name.split(/\s+/).some((part) => part === handle),
    );
  });

  return [...new Set(matched.map((member) => member.id))];
}
