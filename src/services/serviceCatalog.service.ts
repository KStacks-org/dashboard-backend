import { NotFoundError } from "@/errors/AppError.js";
import { prisma } from "@/lib/prisma.js";
import type { UpdateServiceInput } from "@/validation/service.schema.js";

const ownerSelect = { id: true, displayName: true, username: true } as const;

export function listServices() {
  return prisma.service.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      owner: { select: ownerSelect },
      _count: { select: { tasks: { where: { isArchived: false } } } },
      // Only the newest probe is needed for a status dot in the list.
      healthChecks: { orderBy: { checkedAt: "desc" }, take: 1 },
    },
  });
}

export async function getService(codename: string) {
  const service = await prisma.service.findUnique({
    where: { codename },
    include: {
      owner: { select: ownerSelect },
      healthChecks: { orderBy: { checkedAt: "desc" }, take: 30 },
      tasks: {
        where: { isArchived: false },
        orderBy: [{ deadline: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
        include: {
          createdBy: { select: ownerSelect },
          assignees: { include: { user: { select: ownerSelect } } },
          subtasks: { orderBy: { sortOrder: "asc" } },
        },
      },
    },
  });
  if (!service) throw new NotFoundError("Service not found");
  return service;
}

export async function updateService(codename: string, data: UpdateServiceInput) {
  const service = await prisma.service.findUnique({ where: { codename }, select: { id: true } });
  if (!service) throw new NotFoundError("Service not found");

  return prisma.service.update({
    where: { codename },
    data: {
      ...(data.overview !== undefined && { overview: data.overview }),
      ...(data.repoUrl !== undefined && { repoUrl: data.repoUrl }),
      ...(data.healthCheckUrl !== undefined && { healthCheckUrl: data.healthCheckUrl }),
      ...(data.ownerId !== undefined && { ownerId: data.ownerId }),
    },
    include: { owner: { select: ownerSelect } },
  });
}
