import { prisma } from "@/lib/prisma.js";

const userSelect = { id: true, username: true, displayName: true } as const;

export function searchUsers(query: string) {
  if (!query) {
    return prisma.user.findMany({ select: userSelect, orderBy: { displayName: "asc" } });
  }
  return prisma.user.findMany({
    where: {
      OR: [
        { displayName: { contains: query, mode: "insensitive" } },
        { username: { contains: query, mode: "insensitive" } },
      ],
    },
    select: userSelect,
    orderBy: { displayName: "asc" },
  });
}
