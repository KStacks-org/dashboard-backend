import { NotFoundError } from "@/errors/AppError.js";
import { prisma } from "@/lib/prisma.js";
import type { UpdateSubtaskInput } from "@/validation/subtask.schema.js";

export async function addSubtask(taskId: string, title: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true } });
  if (!task) throw new NotFoundError("Task not found");

  const count = await prisma.subtask.count({ where: { taskId } });
  return prisma.subtask.create({
    data: { taskId, title, sortOrder: count },
  });
}

export async function updateSubtask(id: string, data: UpdateSubtaskInput) {
  await ensureSubtaskExists(id);
  return prisma.subtask.update({
    where: { id },
    data: {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.isCompleted !== undefined && { isCompleted: data.isCompleted }),
    },
  });
}

export async function deleteSubtask(id: string) {
  await ensureSubtaskExists(id);
  await prisma.subtask.delete({ where: { id } });
}

async function ensureSubtaskExists(id: string) {
  const exists = await prisma.subtask.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw new NotFoundError("Subtask not found");
}
