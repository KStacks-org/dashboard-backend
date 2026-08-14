import { ForbiddenError, NotFoundError } from "@/errors/AppError.js";
import { prisma } from "@/lib/prisma.js";
import type { CreateTaskInput, UpdateTaskInput } from "@/validation/task.schema.js";

const taskInclude = {
  service: true,
  createdBy: { select: { id: true, displayName: true, username: true } },
  assignees: {
    include: { user: { select: { id: true, displayName: true, username: true } } },
  },
  subtasks: { orderBy: { sortOrder: "asc" as const } },
};

export function listTasks(archived: boolean) {
  return prisma.task.findMany({
    where: { isArchived: archived },
    include: taskInclude,
    orderBy: archived
      ? { archivedAt: "desc" }
      : [{ deadline: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
  });
}

export async function getTask(id: string) {
  const task = await prisma.task.findUnique({ where: { id }, include: taskInclude });
  if (!task) throw new NotFoundError("Task not found");
  return task;
}

export function createTask(data: CreateTaskInput, creatorId: string) {
  return prisma.task.create({
    data: {
      title: data.title,
      description: data.description ?? null,
      deadline: data.deadline ?? null,
      priority: data.priority,
      serviceId: data.serviceId ?? null,
      createdById: creatorId,
      assignees: { createMany: { data: data.assigneeIds.map((userId) => ({ userId })) } },
    },
    include: taskInclude,
  });
}

export async function updateTask(id: string, data: UpdateTaskInput) {
  await ensureTaskExists(id);

  return prisma.$transaction(async (tx) => {
    if (data.assigneeIds) {
      await tx.taskAssignee.deleteMany({ where: { taskId: id } });
      await tx.taskAssignee.createMany({
        data: data.assigneeIds.map((userId) => ({ taskId: id, userId })),
      });
    }

    return tx.task.update({
      where: { id },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.deadline !== undefined && { deadline: data.deadline }),
        ...(data.priority !== undefined && { priority: data.priority }),
        ...(data.serviceId !== undefined && { serviceId: data.serviceId }),
      },
      include: taskInclude,
    });
  });
}

export async function archiveTask(id: string) {
  await ensureTaskExists(id);
  return prisma.task.update({
    where: { id },
    data: { isArchived: true, archivedAt: new Date() },
    include: taskInclude,
  });
}

export async function restoreTask(id: string) {
  await ensureTaskExists(id);
  return prisma.task.update({
    where: { id },
    data: { isArchived: false, archivedAt: null },
    include: taskInclude,
  });
}

export async function deleteTask(id: string, requesterId: string) {
  const task = await prisma.task.findUnique({ where: { id }, select: { createdById: true } });
  if (!task) throw new NotFoundError("Task not found");
  if (task.createdById !== requesterId) {
    throw new ForbiddenError("Only the person who created this task can delete it");
  }
  await prisma.task.delete({ where: { id } });
}

async function ensureTaskExists(id: string) {
  const exists = await prisma.task.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw new NotFoundError("Task not found");
}
