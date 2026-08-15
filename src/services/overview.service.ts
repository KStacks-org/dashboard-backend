import { prisma } from "@/lib/prisma.js";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The numbers behind the home page. Counted in the database rather than by
 * loading rows, so the page stays cheap as the task list grows.
 */
export async function getOverview(userId: string) {
  const weekAgo = new Date(Date.now() - WEEK_MS);
  const soon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

  const [
    activeTasks,
    completedThisWeek,
    openIssues,
    services,
    myTasks,
    overdueCount,
    dueSoonCount,
    milestones,
  ] = await Promise.all([
    prisma.task.count({ where: { isArchived: false } }),
    prisma.task.count({ where: { isArchived: true, archivedAt: { gte: weekAgo } } }),
    prisma.issue.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } }),
    prisma.service.findMany({
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        codename: true,
        healthCheckUrl: true,
        healthChecks: { orderBy: { checkedAt: "desc" }, take: 1 },
      },
    }),
    prisma.task.findMany({
      where: { isArchived: false, assignees: { some: { userId } } },
      orderBy: [{ deadline: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      take: 8,
      include: {
        service: { select: { id: true, name: true } },
        subtasks: { select: { isCompleted: true } },
      },
    }),
    prisma.task.count({
      where: { isArchived: false, deadline: { lt: new Date() } },
    }),
    prisma.task.count({
      where: { isArchived: false, deadline: { gte: new Date(), lte: soon } },
    }),
    prisma.milestone.findMany({
      orderBy: [{ sortOrder: "asc" }, { deadline: { sort: "asc", nulls: "last" } }],
      take: 4,
      include: { tasks: { select: { isArchived: true } } },
    }),
  ]);

  const monitored = services.filter((service) => service.healthCheckUrl);
  const up = monitored.filter((service) => service.healthChecks[0]?.isUp).length;

  return {
    stats: {
      activeTasks,
      completedThisWeek,
      openIssues,
      // "7 / 8" style: services responding out of those actually monitored.
      servicesUp: up,
      servicesMonitored: monitored.length,
      servicesTotal: services.length,
      overdueTasks: overdueCount,
      dueSoonTasks: dueSoonCount,
    },
    myTasks: myTasks.map(({ subtasks, ...task }) => ({
      ...task,
      subtaskTotal: subtasks.length,
      subtaskCompleted: subtasks.filter((subtask) => subtask.isCompleted).length,
    })),
    milestones: milestones.map(({ tasks, ...milestone }) => ({
      ...milestone,
      totalTasks: tasks.length,
      completedTasks: tasks.filter((task) => task.isArchived).length,
    })),
  };
}
