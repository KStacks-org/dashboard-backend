import { BadRequestError, ConflictError, NotFoundError } from "@/errors/AppError.js";
import { prisma } from "@/lib/prisma.js";
import type { CreateMemberInput, UpdateMemberInput } from "@/validation/team.schema.js";

const memberSelect = {
  id: true,
  email: true,
  displayName: true,
  role: true,
  jobTitle: true,
  responsibilities: true,
  isActive: true,
  createdAt: true,
  adminGrants: { select: { scope: true }, orderBy: { scope: "asc" } },
} as const;

/**
 * The roster with each person's live workload, so the page answers "who is
 * loaded right now" without a second round of queries per member.
 */
export async function listTeam() {
  const members = await prisma.user.findMany({
    select: memberSelect,
    orderBy: [{ isActive: "desc" }, { role: "asc" }, { displayName: "asc" }],
  });

  const [assignments, issueCounts] = await Promise.all([
    prisma.taskAssignee.findMany({
      select: { userId: true, task: { select: { status: true, isArchived: true } } },
    }),
    prisma.issue.groupBy({
      by: ["assigneeId"],
      where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
      _count: { _all: true },
    }),
  ]);

  const openIssuesByUser = new Map(
    issueCounts
      .filter((row) => row.assigneeId !== null)
      .map((row) => [row.assigneeId as string, row._count._all]),
  );

  return members.map((member) => {
    const mine = assignments.filter((a) => a.userId === member.id).map((a) => a.task);
    const active = mine.filter((task) => !task.isArchived);

    return {
      ...member,
      workload: {
        activeTasks: active.length,
        completedTasks: mine.length - active.length,
        todo: active.filter((task) => task.status === "TODO").length,
        inProgress: active.filter((task) => task.status === "IN_PROGRESS").length,
        blocked: active.filter((task) => task.status === "BLOCKED").length,
        openIssues: openIssuesByUser.get(member.id) ?? 0,
      },
    };
  });
}

export async function createMember(data: CreateMemberInput) {
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) throw new ConflictError("Someone with that email is already on the team");

  // A readable, collision-free internal key derived from the address.
  const base = data.email.split("@")[0]?.replace(/[^a-z0-9._-]/gi, "") || "member";
  let username = base.slice(0, 40);
  let attempt = 1;
  while (await prisma.user.findUnique({ where: { username }, select: { id: true } })) {
    username = `${base.slice(0, 36)}.${++attempt}`;
  }

  return prisma.user.create({
    data: {
      email: data.email,
      username,
      displayName: data.displayName,
      jobTitle: data.jobTitle ?? null,
      role: data.role,
      responsibilities: data.responsibilities ?? [],
    },
    select: memberSelect,
  });
}

export async function updateMember(id: string, data: UpdateMemberInput, requesterId: string) {
  const member = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true } });
  if (!member) throw new NotFoundError("Team member not found");

  // Guard against the last super admin being demoted or switched off — nobody
  // could grant roles again, and only a super admin can.
  const losingSuperAdmin =
    member.role === "SUPER_ADMIN" &&
    ((data.role !== undefined && data.role !== "SUPER_ADMIN") || data.isActive === false);

  if (losingSuperAdmin) {
    const others = await prisma.user.count({
      where: { role: "SUPER_ADMIN", isActive: true, id: { not: id } },
    });
    if (others === 0) throw new BadRequestError("The last super admin cannot be removed");
  }

  if (data.isActive === false && id === requesterId) {
    throw new BadRequestError("You cannot deactivate your own account");
  }

  return prisma.user.update({
    where: { id },
    data: {
      ...(data.displayName !== undefined && { displayName: data.displayName }),
      ...(data.jobTitle !== undefined && { jobTitle: data.jobTitle }),
      ...(data.role !== undefined && { role: data.role }),
      ...(data.responsibilities !== undefined && { responsibilities: data.responsibilities }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
    },
    select: memberSelect,
  });
}
