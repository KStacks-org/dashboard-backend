import { prisma } from "@/lib/prisma.js";
import { serviceRoleScope } from "@/lib/serviceAccess.js";

/**
 * The scope that means "this app". Every other scope is a service codename.
 *
 * A dashboard grant is the only one that changes what someone can do here in a
 * broad way; service grants exist mainly to be minted into the shared token so
 * the service itself can recognise its admins.
 */
export const DASHBOARD_SCOPE = "dashboard";

export type Grants = {
  isSuperAdmin: boolean;
  scopes: string[];
};

/** Opening the dashboard is an explicit membership decision. */
export function canAccessDashboard(user: { hasDashboardAccess: boolean }, grants: Grants): boolean {
  return grants.isSuperAdmin || user.hasDashboardAccess;
}

/** Reads the scopes held by one person. A super admin holds all of them. */
export async function loadGrants(userId: string, role: string): Promise<Grants> {
  const rows = await prisma.adminGrant.findMany({
    where: { userId },
    select: { scope: true },
    orderBy: { scope: "asc" },
  });

  return { isSuperAdmin: role === "SUPER_ADMIN", scopes: rows.map((row) => row.scope) };
}

/**
 * Full powers inside this app: every rule that a plain member is held to, a
 * dashboard admin is exempt from. A super admin qualifies without a grant row,
 * since holding every scope is what the role means.
 */
export function canAdministerDashboard(grants: Grants): boolean {
  return grants.isSuperAdmin || grants.scopes.includes(DASHBOARD_SCOPE);
}

/** Whether this person owns at least one service-wide ADMIN scope. */
export function canAdministerAnyService(grants: Grants): boolean {
  return grants.isSuperAdmin || grants.scopes.some((scope) => scope.endsWith("-ADMIN"));
}

/**
 * Admin of one particular service. Inside the dashboard this buys exactly one
 * thing — authority over the tasks and issues attached to that service — and
 * nothing else; the grant's real audience is the service itself.
 */
export function canAdministerService(grants: Grants, accessScopeKey: string | null): boolean {
  if (grants.isSuperAdmin) return true;
  if (!accessScopeKey) return false;
  return grants.scopes.includes(serviceRoleScope(accessScopeKey, "ADMIN"));
}

/**
 * The rule for editing or deleting someone else's task or issue: you wrote it,
 * you run this app, or you run the service it belongs to.
 */
export function canManageRecord(
  grants: Grants,
  record: { authorId: string; serviceAccessScopeKey: string | null },
  requesterId: string,
): boolean {
  if (record.authorId === requesterId) return true;
  if (canAdministerDashboard(grants)) return true;
  return canAdministerService(grants, record.serviceAccessScopeKey);
}

/**
 * Scopes that may be granted: this app, every service's built-in ADMIN role,
 * and its super-admin-defined custom roles. The catalogue stays the source of
 * truth, so deleted or invented strings can never be granted.
 */
export async function grantableScopes(): Promise<string[]> {
  const services = await prisma.service.findMany({
    select: {
      accessScopeKey: true,
      accessRoles: { select: { name: true }, orderBy: { name: "asc" } },
    },
    orderBy: { sortOrder: "asc" },
  });
  return [
    DASHBOARD_SCOPE,
    ...services.flatMap((service) => [
      serviceRoleScope(service.accessScopeKey, "ADMIN"),
      ...service.accessRoles.map((role) => serviceRoleScope(service.accessScopeKey, role.name)),
    ]),
  ];
}
