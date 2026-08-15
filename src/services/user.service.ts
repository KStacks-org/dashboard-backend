import { prisma } from "@/lib/prisma.js";

// `username` is an internal seed key and is never sent to the client; email is
// what the team recognises each other by, and it disambiguates shared names.
const userSelect = { id: true, email: true, displayName: true } as const;

export function searchUsers(query: string) {
  // Deactivated members keep their history but are never offered for new work.
  if (!query) {
    return prisma.user.findMany({
      where: { isActive: true },
      select: userSelect,
      orderBy: { displayName: "asc" },
    });
  }
  return prisma.user.findMany({
    where: {
      isActive: true,
      OR: [
        { displayName: { contains: query, mode: "insensitive" } },
        { email: { contains: query, mode: "insensitive" } },
      ],
    },
    select: userSelect,
    orderBy: { displayName: "asc" },
  });
}
