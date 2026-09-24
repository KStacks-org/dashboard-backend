import { BadRequestError, ForbiddenError, NotFoundError } from "@/errors/AppError.js";
import { DASHBOARD_SCOPE } from "@/lib/authz.js";
import { prisma } from "@/lib/prisma.js";
import { normalizeAccessScope, serviceRoleScope } from "@/lib/serviceAccess.js";
import type {
  CreateServiceAccessRoleInput,
  DeleteServiceAccessRoleInput,
} from "@/validation/grant.schema.js";

type ServiceForScope = {
  id: string;
  codename: string;
  name: string;
  accessScopeKey: string;
};

type GrantRequester = {
  id: string;
  isSuperAdmin: boolean;
  scopes: string[];
};

function serviceScope(service: ServiceForScope, role: string, id: string | null) {
  return {
    id,
    scope: serviceRoleScope(service.accessScopeKey, role),
    name: service.name,
    role,
    serviceId: service.id,
    serviceCodename: service.codename,
    isDashboard: false,
  };
}

/**
 * The scopes that can be handed out, with a label for the UI. Built from the
 * live service catalogue, so a service added by the sync is grantable at once.
 */
export async function listGrantableScopes() {
  const services = await prisma.service.findMany({
    select: {
      id: true,
      codename: true,
      name: true,
      accessScopeKey: true,
      accessRoles: { select: { id: true, name: true }, orderBy: { name: "asc" } },
    },
    orderBy: { sortOrder: "asc" },
  });

  return [
    {
      id: null,
      scope: DASHBOARD_SCOPE,
      name: "Dashboard",
      role: "ADMIN",
      serviceId: null,
      serviceCodename: null,
      isDashboard: true,
    },
    ...services.flatMap((service) => [
      serviceScope(service, "ADMIN", null),
      ...service.accessRoles.map((role) => serviceScope(service, role.name, role.id)),
    ]),
  ];
}

/** Creates one reusable, service-specific role. The route is super-admin only. */
export async function createServiceAccessRole(
  serviceId: string,
  data: CreateServiceAccessRoleInput,
) {
  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { id: true, codename: true, name: true, accessScopeKey: true },
  });
  if (!service) throw new NotFoundError("Service not found");

  const role = await prisma.serviceAccessRole.create({
    data: { serviceId, name: data.name },
    select: { id: true, name: true },
  });

  return serviceScope(service, role.name, role.id);
}

/** Deletes a custom role and revokes its scope from every account. */
export async function deleteServiceAccessRole(
  serviceId: string,
  roleId: string,
  data: DeleteServiceAccessRoleInput,
) {
  const role = await prisma.serviceAccessRole.findFirst({
    where: { id: roleId, serviceId },
    select: {
      id: true,
      name: true,
      service: { select: { accessScopeKey: true } },
    },
  });
  if (!role) throw new NotFoundError("Service role not found");

  const scope = serviceRoleScope(role.service.accessScopeKey, role.name);
  if (data.confirmation !== scope) {
    throw new BadRequestError(`Type ${scope} exactly to confirm deletion`);
  }

  await prisma.$transaction([
    prisma.adminGrant.deleteMany({ where: { scope } }),
    prisma.serviceAccessRole.delete({ where: { id: role.id } }),
  ]);
}

/**
 * Replaces someone's scopes wholesale.
 *
 * A whole-set write rather than add/remove calls: the editor sends the state it
 * wants, so two admins working at once cannot interleave into a half-applied
 * result, and revoking is not a separate code path that can be forgotten.
 */
export async function setGrants(
  userId: string,
  scopes: string[],
  hasDashboardAccess: boolean | undefined,
  requester: GrantRequester,
) {
  const member = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, hasDashboardAccess: true },
  });
  if (!member) throw new NotFoundError("Team member not found");

  const grantable = await listGrantableScopes();
  const allowed = new Set(grantable.map((entry) => entry.scope));
  const unknown = scopes.filter((scope) => !allowed.has(scope));
  if (unknown.length > 0) {
    throw new BadRequestError(`Unknown scope: ${unknown.join(", ")}`);
  }

  const wantedSet = new Set(scopes);

  if (!requester.isSuperAdmin) {
    if (member.role === "SUPER_ADMIN") {
      throw new ForbiddenError("A service admin cannot change a super admin's access");
    }

    const managedServiceIds = new Set(
      grantable
        .filter(
          (entry) =>
            !entry.isDashboard && entry.role === "ADMIN" && requester.scopes.includes(entry.scope),
        )
        .map((entry) => entry.serviceId),
    );
    const delegable = new Set(
      grantable
        .filter(
          (entry) =>
            entry.serviceId !== null &&
            managedServiceIds.has(entry.serviceId) &&
            entry.role !== "ADMIN",
        )
        .map((entry) => entry.scope),
    );
    const current = new Set(await listGrants(userId));
    const changed = new Set([...current, ...wantedSet]);

    for (const scope of changed) {
      if (current.has(scope) !== wantedSet.has(scope) && !delegable.has(scope)) {
        throw new ForbiddenError(
          "A service admin can only grant child roles under services they administer",
        );
      }
    }

    if (hasDashboardAccess !== undefined && hasDashboardAccess !== member.hasDashboardAccess) {
      throw new ForbiddenError("Only a super admin can change dashboard access");
    }
  }

  // service-admin is the service-wide role. Keeping narrower roles beside it
  // would make the stored state and JWT ambiguous, so ADMIN canonicalizes the
  // service to a single scope.
  for (const admin of grantable.filter((entry) => !entry.isDashboard && entry.role === "ADMIN")) {
    if (!wantedSet.has(admin.scope)) continue;
    for (const entry of grantable) {
      if (entry.serviceId === admin.serviceId && entry.role !== "ADMIN") {
        wantedSet.delete(entry.scope);
      }
    }
  }

  const wanted = [...wantedSet];

  // A super admin already holds everything; storing rows for them would imply
  // their authority could be revoked scope by scope, which it cannot.
  if (member.role === "SUPER_ADMIN" && wanted.length > 0) {
    throw new BadRequestError("A super admin already holds every scope");
  }

  const dashboardAccess = hasDashboardAccess ?? member.hasDashboardAccess;

  if (!dashboardAccess && wanted.includes(DASHBOARD_SCOPE)) {
    throw new BadRequestError("Dashboard admin scope requires dashboard access");
  }

  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { hasDashboardAccess: dashboardAccess } }),
    prisma.adminGrant.deleteMany({ where: { userId, scope: { notIn: wanted } } }),
    prisma.adminGrant.createMany({
      data: wanted.map((scope) => ({ userId, scope, grantedById: requester.id })),
      skipDuplicates: true,
    }),
  ]);

  return { scopes: await listGrants(userId), hasDashboardAccess: dashboardAccess };
}

export async function listGrants(userId: string) {
  const rows = await prisma.adminGrant.findMany({
    where: { userId },
    select: { scope: true },
    orderBy: { scope: "asc" },
  });
  return rows.map((row) => normalizeAccessScope(row.scope));
}
