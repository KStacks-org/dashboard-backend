import { ConflictError, ForbiddenError, NotFoundError } from "@/errors/AppError.js";
import { prisma } from "@/lib/prisma.js";
import { notify } from "@/services/notification.service.js";
import type { CreateIssueInput, UpdateIssueInput } from "@/validation/issue.schema.js";

const memberSelect = { id: true, displayName: true, email: true } as const;

const issueInclude = {
  service: { select: { id: true, name: true, codename: true } },
  assignee: { select: memberSelect },
  reportedBy: { select: memberSelect },
  convertedTask: { select: { id: true, reference: true, title: true } },
};

export function listIssues() {
  return prisma.issue.findMany({
    include: issueInclude,
    // Open work first, then most recently raised.
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
}

export async function getIssue(id: string) {
  const issue = await prisma.issue.findUnique({ where: { id }, include: issueInclude });
  if (!issue) throw new NotFoundError("Issue not found");
  return issue;
}

export async function createIssue(data: CreateIssueInput, reporterId: string) {
  const issue = await prisma.issue.create({
    data: {
      title: data.title,
      description: data.description ?? null,
      priority: data.priority,
      status: data.status,
      serviceId: data.serviceId ?? null,
      assigneeId: data.assigneeId ?? null,
      reportedById: reporterId,
    },
    include: issueInclude,
  });

  if (issue.assigneeId) {
    await notify([
      {
        userId: issue.assigneeId,
        type: "ISSUE_ASSIGNED",
        body: issue.title,
        actorId: reporterId,
        issueId: issue.id,
      },
    ]);
  }
  return issue;
}

export async function updateIssue(id: string, data: UpdateIssueInput, actorId: string) {
  const existing = await prisma.issue.findUnique({
    where: { id },
    select: { id: true, assigneeId: true },
  });
  if (!existing) throw new NotFoundError("Issue not found");

  const issue = await prisma.issue.update({
    where: { id },
    data: {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.priority !== undefined && { priority: data.priority }),
      ...(data.status !== undefined && { status: data.status }),
      ...(data.serviceId !== undefined && { serviceId: data.serviceId }),
      ...(data.assigneeId !== undefined && { assigneeId: data.assigneeId }),
    },
    include: issueInclude,
  });

  // Only ping on a genuine hand-over, not on every unrelated edit.
  if (issue.assigneeId && issue.assigneeId !== existing.assigneeId) {
    await notify([
      {
        userId: issue.assigneeId,
        type: "ISSUE_ASSIGNED",
        body: issue.title,
        actorId,
        issueId: issue.id,
      },
    ]);
  }
  return issue;
}

export async function deleteIssue(id: string, requesterId: string) {
  const issue = await prisma.issue.findUnique({ where: { id }, select: { reportedById: true } });
  if (!issue) throw new NotFoundError("Issue not found");
  if (issue.reportedById !== requesterId) {
    throw new ForbiddenError("Only the person who reported this issue can delete it");
  }
  await prisma.issue.delete({ where: { id } });
}

/**
 * Promotes a bug report into a piece of work. The issue is kept and linked
 * rather than replaced, so the original report and its history survive.
 */
export async function convertToTask(id: string, actorId: string) {
  const issue = await prisma.issue.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      description: true,
      priority: true,
      serviceId: true,
      assigneeId: true,
      convertedTaskId: true,
    },
  });
  if (!issue) throw new NotFoundError("Issue not found");
  if (issue.convertedTaskId) throw new ConflictError("This issue already has a task");

  // Someone has to own the resulting task; fall back to whoever converted it.
  const assigneeId = issue.assigneeId ?? actorId;

  return prisma.$transaction(async (tx) => {
    const task = await tx.task.create({
      data: {
        title: issue.title,
        description: issue.description,
        priority: issue.priority,
        serviceId: issue.serviceId,
        createdById: actorId,
        assignees: { create: { userId: assigneeId } },
      },
    });

    await tx.issue.update({
      where: { id: issue.id },
      data: { convertedTaskId: task.id, status: "IN_PROGRESS" },
    });

    return tx.issue.findUniqueOrThrow({ where: { id: issue.id }, include: issueInclude });
  });
}
