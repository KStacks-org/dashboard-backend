import { prisma } from "@/lib/prisma.js";

export function listServices() {
  return prisma.service.findMany({ orderBy: { sortOrder: "asc" } });
}
