import { NotFoundError } from "@/errors/AppError.js";
import { prisma } from "@/lib/prisma.js";

export async function addLink(taskId: string, url: string, label?: string | null) {
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true } });
  if (!task) throw new NotFoundError("Task not found");

  return prisma.taskLink.create({ data: { taskId, url, label: label ?? null } });
}

export async function deleteLink(id: string) {
  const exists = await prisma.taskLink.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw new NotFoundError("Link not found");
  await prisma.taskLink.delete({ where: { id } });
}
