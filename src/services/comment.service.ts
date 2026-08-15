import { ForbiddenError, NotFoundError } from "@/errors/AppError.js";
import { prisma } from "@/lib/prisma.js";
import { findMentionedUsers, notify } from "@/services/notification.service.js";

const commentInclude = {
  author: { select: { id: true, displayName: true, username: true } },
};

export async function addComment(taskId: string, authorId: string, body: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true } });
  if (!task) throw new NotFoundError("Task not found");

  const comment = await prisma.taskComment.create({
    data: { taskId, authorId, body },
    include: commentInclude,
  });

  // "@name" in the body pings that person, matching on their email handle or
  // any part of their display name.
  const mentioned = await findMentionedUsers(body);
  await notify(
    mentioned.map((userId) => ({
      userId,
      type: "COMMENT_MENTION" as const,
      body,
      actorId: authorId,
      taskId,
    })),
  );

  return comment;
}

/** A comment is someone's own words — only its author may edit or remove it. */
export async function updateComment(id: string, requesterId: string, body: string) {
  await ensureAuthor(id, requesterId);
  return prisma.taskComment.update({ where: { id }, data: { body }, include: commentInclude });
}

export async function deleteComment(id: string, requesterId: string) {
  await ensureAuthor(id, requesterId);
  await prisma.taskComment.delete({ where: { id } });
}

async function ensureAuthor(id: string, requesterId: string) {
  const comment = await prisma.taskComment.findUnique({
    where: { id },
    select: { authorId: true },
  });
  if (!comment) throw new NotFoundError("Comment not found");
  if (comment.authorId !== requesterId) {
    throw new ForbiddenError("Only the person who wrote this comment can change it");
  }
}
