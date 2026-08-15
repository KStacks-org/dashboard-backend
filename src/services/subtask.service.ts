import { BadRequestError, NotFoundError } from "@/errors/AppError.js";
import { prisma } from "@/lib/prisma.js";
import type { ReorderSubtasksInput, UpdateSubtaskInput } from "@/validation/subtask.schema.js";

const subtaskInclude = {
  assignee: { select: { id: true, displayName: true, username: true } },
};

export async function addSubtask(taskId: string, title: string, assigneeId?: string | null) {
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true } });
  if (!task) throw new NotFoundError("Task not found");

  if (assigneeId) await ensureAssigneeIsOnTask(taskId, assigneeId);

  const count = await prisma.subtask.count({ where: { taskId } });
  return prisma.subtask.create({
    data: { taskId, title, sortOrder: count, assigneeId: assigneeId ?? null },
    include: subtaskInclude,
  });
}

export async function updateSubtask(id: string, data: UpdateSubtaskInput) {
  const subtask = await prisma.subtask.findUnique({
    where: { id },
    select: { id: true, taskId: true },
  });
  if (!subtask) throw new NotFoundError("Subtask not found");

  if (data.assigneeId) await ensureAssigneeIsOnTask(subtask.taskId, data.assigneeId);

  return prisma.subtask.update({
    where: { id },
    data: {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.isCompleted !== undefined && { isCompleted: data.isCompleted }),
      ...(data.assigneeId !== undefined && { assigneeId: data.assigneeId }),
    },
    include: subtaskInclude,
  });
}

export async function deleteSubtask(id: string) {
  const exists = await prisma.subtask.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw new NotFoundError("Subtask not found");
  await prisma.subtask.delete({ where: { id } });
}

/**
 * Rewrites sort_order for a task's subtasks in one transaction, so a failed
 * reorder can never leave the list half-renumbered.
 */
export async function reorderSubtasks(taskId: string, { orderedIds }: ReorderSubtasksInput) {
  const existing = await prisma.subtask.findMany({
    where: { taskId },
    select: { id: true },
  });
  if (existing.length === 0) throw new NotFoundError("Task has no subtasks");

  const existingIds = new Set(existing.map((s) => s.id));
  const allBelongToTask = orderedIds.every((id) => existingIds.has(id));
  if (!allBelongToTask || orderedIds.length !== existing.length) {
    throw new BadRequestError("The order must list exactly this task's subtasks");
  }

  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.subtask.update({ where: { id }, data: { sortOrder: index } }),
    ),
  );

  return prisma.subtask.findMany({
    where: { taskId },
    orderBy: { sortOrder: "asc" },
    include: subtaskInclude,
  });
}

/** A subtask owner must already be an assignee of the parent task. */
async function ensureAssigneeIsOnTask(taskId: string, userId: string) {
  const membership = await prisma.taskAssignee.findUnique({
    where: { taskId_userId: { taskId, userId } },
    select: { userId: true },
  });
  if (!membership) {
    throw new BadRequestError("Assign this person to the task before giving them a subtask");
  }
}
