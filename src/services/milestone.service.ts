import { NotFoundError } from "@/errors/AppError.js";
import { prisma } from "@/lib/prisma.js";
import type { CreateMilestoneInput, UpdateMilestoneInput } from "@/validation/milestone.schema.js";

type MilestoneTask = { isArchived: boolean; status: string };

/** A milestone's task is "done" when it has been archived, matching the rest of the app. */
function progressOf(tasks: MilestoneTask[]) {
  const completed = tasks.filter((task) => task.isArchived).length;
  return {
    totalTasks: tasks.length,
    completedTasks: completed,
    // Null rather than 0% for an empty milestone — nothing has gone wrong yet.
    percent: tasks.length === 0 ? null : Math.round((completed / tasks.length) * 100),
  };
}

export async function listMilestones() {
  const milestones = await prisma.milestone.findMany({
    orderBy: [{ sortOrder: "asc" }, { deadline: { sort: "asc", nulls: "last" } }],
    include: { tasks: { select: { isArchived: true, status: true } } },
  });

  return milestones.map(({ tasks, ...milestone }) => ({
    ...milestone,
    progress: progressOf(tasks),
  }));
}

export async function getMilestone(id: string) {
  const milestone = await prisma.milestone.findUnique({
    where: { id },
    include: {
      tasks: {
        orderBy: [{ isArchived: "asc" }, { deadline: { sort: "asc", nulls: "last" } }],
        include: {
          assignees: { include: { user: { select: { id: true, displayName: true } } } },
          service: { select: { id: true, name: true } },
        },
      },
    },
  });
  if (!milestone) throw new NotFoundError("Milestone not found");

  return { ...milestone, progress: progressOf(milestone.tasks) };
}

export function createMilestone(data: CreateMilestoneInput) {
  return prisma.milestone.create({
    data: {
      title: data.title,
      description: data.description ?? null,
      deadline: data.deadline ?? null,
      sortOrder: data.sortOrder ?? 0,
    },
  });
}

export async function updateMilestone(id: string, data: UpdateMilestoneInput) {
  await ensureExists(id);
  return prisma.milestone.update({
    where: { id },
    data: {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.deadline !== undefined && { deadline: data.deadline }),
      ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
    },
  });
}

export async function deleteMilestone(id: string) {
  await ensureExists(id);
  // Tasks survive: the FK is SetNull, so deleting a goal never deletes work.
  await prisma.milestone.delete({ where: { id } });
}

async function ensureExists(id: string) {
  const exists = await prisma.milestone.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw new NotFoundError("Milestone not found");
}
