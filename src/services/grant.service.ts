import { BadRequestError, NotFoundError } from "@/errors/AppError.js";
import { DASHBOARD_SCOPE, grantableScopes } from "@/lib/authz.js";
import { prisma } from "@/lib/prisma.js";

/**
 * The scopes that can be handed out, with a label for the UI. Built from the
 * live service catalogue, so a service added by the sync is grantable at once.
 */
export async function listGrantableScopes() {
  const services = await prisma.service.findMany({
    select: { codename: true, name: true },
    orderBy: { sortOrder: "asc" },
  });

  return [
    { scope: DASHBOARD_SCOPE, name: "Dashboard", isDashboard: true },
    ...services.map((service) => ({ ...service, scope: service.codename, isDashboard: false })),
  ];
}

/**
 * Replaces someone's scopes wholesale.
 *
 * A whole-set write rather than add/remove calls: the editor sends the state it
 * wants, so two admins working at once cannot interleave into a half-applied
 * result, and revoking is not a separate code path that can be forgotten.
 */
export async function setGrants(userId: string, scopes: string[], grantedById: string) {
  const member = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!member) throw new NotFoundError("Team member not found");

  const allowed = new Set(await grantableScopes());
  const unknown = scopes.filter((scope) => !allowed.has(scope));
  if (unknown.length > 0) {
    throw new BadRequestError(`Unknown scope: ${unknown.join(", ")}`);
  }

  const wanted = [...new Set(scopes)];

  // A super admin already holds everything; storing rows for them would imply
  // their authority could be revoked scope by scope, which it cannot.
  if (member.role === "SUPER_ADMIN" && wanted.length > 0) {
    throw new BadRequestError("A super admin already holds every scope");
  }

  await prisma.$transaction([
    prisma.adminGrant.deleteMany({ where: { userId, scope: { notIn: wanted } } }),
    prisma.adminGrant.createMany({
      data: wanted.map((scope) => ({ userId, scope, grantedById })),
      skipDuplicates: true,
    }),
  ]);

  return listGrants(userId);
}

export async function listGrants(userId: string) {
  const rows = await prisma.adminGrant.findMany({
    where: { userId },
    select: { scope: true },
    orderBy: { scope: "asc" },
  });
  return rows.map((row) => row.scope);
}
