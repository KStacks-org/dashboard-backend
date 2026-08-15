import { ConflictError, ForbiddenError, NotFoundError } from "@/errors/AppError.js";
import { canManageRecord, type Grants } from "@/lib/authz.js";
import { prisma } from "@/lib/prisma.js";
import { notify } from "@/services/notification.service.js";
import type { CreateTaskInput, UpdateTaskInput } from "@/validation/task.schema.js";

const memberSelect = { id: true, displayName: true, username: true } as const;

const taskInclude = {
  service: true,
  milestone: { select: { id: true, title: true, deadline: true } },
  createdBy: { select: memberSelect },
  assignees: { include: { user: { select: memberSelect } } },
  subtasks: {
    orderBy: { sortOrder: "asc" as const },
    include: { assignee: { select: memberSelect } },
  },
  links: { orderBy: { createdAt: "asc" as const } },
  comments: {
    orderBy: { createdAt: "asc" as const },
    include: { author: { select: memberSelect } },
  },
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

export async function createTask(data: CreateTaskInput, creatorId: string) {
  const task = await prisma.task.create({
    data: {
      title: data.title,
      description: data.description ?? null,
      deadline: data.deadline ?? null,
      priority: data.priority,
      status: data.status,
      serviceId: data.serviceId ?? null,
      milestoneId: data.milestoneId ?? null,
      createdById: creatorId,
      assignees: { createMany: { data: data.assigneeIds.map((userId) => ({ userId })) } },
    },
    include: taskInclude,
  });

  await notify(
    data.assigneeIds.map((userId) => ({
      userId,
      type: "TASK_ASSIGNED" as const,
      body: task.title,
      actorId: creatorId,
      taskId: task.id,
    })),
  );

  return task;
}

export async function updateTask(id: string, data: UpdateTaskInput, actorId?: string) {
  await ensureTaskExists(id);

  if (data.assigneeIds) {
    await ensureRemovedAssigneesHoldNoSubtasks(id, data.assigneeIds);
  }

  // Captured before the rewrite so only genuinely new assignees are notified.
  const previousAssignees = data.assigneeIds
    ? (await prisma.taskAssignee.findMany({ where: { taskId: id }, select: { userId: true } })).map(
        (row) => row.userId,
      )
    : [];

  const task = await prisma.$transaction(async (tx) => {
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
        ...(data.status !== undefined && { status: data.status }),
        ...(data.serviceId !== undefined && { serviceId: data.serviceId }),
        ...(data.milestoneId !== undefined && { milestoneId: data.milestoneId }),
      },
      include: taskInclude,
    });
  });

  if (data.assigneeIds) {
    const added = data.assigneeIds.filter((userId) => !previousAssignees.includes(userId));
    await notify(
      added.map((userId) => ({
        userId,
        type: "TASK_ASSIGNED" as const,
        body: task.title,
        actorId: actorId ?? null,
        taskId: task.id,
      })),
    );
  }

  return task;
}

/**
 * Refuses to drop someone from a task while they still own subtasks on it.
 * Silently unassigning their work would lose accountability with no signal, so
 * the caller is told exactly who to reassign first.
 */
async function ensureRemovedAssigneesHoldNoSubtasks(taskId: string, nextAssigneeIds: string[]) {
  const keep = new Set(nextAssigneeIds);

  const strandedSubtasks = await prisma.subtask.findMany({
    where: { taskId, assigneeId: { not: null, notIn: nextAssigneeIds } },
    select: { assignee: { select: { id: true, displayName: true } } },
  });

  const blockedBy = new Map<string, string>();
  for (const { assignee } of strandedSubtasks) {
    if (assignee && !keep.has(assignee.id)) blockedBy.set(assignee.id, assignee.displayName);
  }

  if (blockedBy.size > 0) {
    throw new ConflictError("Reassign their subtasks before removing them from this task", {
      blockedBy: [...blockedBy].map(([id, displayName]) => ({ id, displayName })),
    });
  }
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

export async function deleteTask(id: string, requesterId: string, grants: Grants) {
  const task = await prisma.task.findUnique({
    where: { id },
    select: { createdById: true, service: { select: { codename: true } } },
  });
  if (!task) throw new NotFoundError("Task not found");

  const allowed = canManageRecord(
    grants,
    { authorId: task.createdById, serviceCodename: task.service?.codename ?? null },
    requesterId,
  );
  if (!allowed) {
    throw new ForbiddenError("Only the person who created this task can delete it");
  }
  await prisma.task.delete({ where: { id } });
}

async function ensureTaskExists(id: string) {
  const exists = await prisma.task.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw new NotFoundError("Task not found");
}
