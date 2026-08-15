import { ForbiddenError, NotFoundError } from "@/errors/AppError.js";
import { prisma } from "@/lib/prisma.js";

const commentInclude = {
  author: { select: { id: true, displayName: true, username: true } },
};

export async function addComment(taskId: string, authorId: string, body: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true } });
  if (!task) throw new NotFoundError("Task not found");

  return prisma.taskComment.create({
    data: { taskId, authorId, body },
    include: commentInclude,
  });
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
