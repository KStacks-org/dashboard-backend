import type { NextFunction, Request, Response } from "express";
import { ForbiddenError, UnauthorizedError } from "@/errors/AppError.js";
import { canAdministerAnyService, canAdministerDashboard } from "@/lib/authz.js";

/**
 * Full authority inside this app — held by a super admin, or by anyone granted
 * the "dashboard-admin" scope. Everything not gated by this stays equal-permission
 * between team members.
 */
export function requireDashboardAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user || !req.grants) return next(new UnauthorizedError());
  if (!canAdministerDashboard(req.grants)) {
    return next(new ForbiddenError("Only a dashboard admin can do that"));
  }
  next();
}

/** Dashboard admins and service admins may add a service-only identity. */
export function requireTeamMemberCreator(req: Request, _res: Response, next: NextFunction) {
  if (!req.user || !req.grants) return next(new UnauthorizedError());
  if (!canAdministerDashboard(req.grants) && !canAdministerAnyService(req.grants)) {
    return next(new ForbiddenError("Only an admin can add team members"));
  }
  next();
}

/** Fine-grained checks in the service restrict which child scopes may change. */
export function requireGrantManager(req: Request, _res: Response, next: NextFunction) {
  if (!req.user || !req.grants) return next(new UnauthorizedError());
  if (!canAdministerAnyService(req.grants)) {
    return next(new ForbiddenError("Only a super admin or service admin can change access"));
  }
  next();
}

/** Only a super admin may create or delete the available role definitions. */
export function requireSuperAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user || !req.grants) return next(new UnauthorizedError());
  if (!req.grants.isSuperAdmin) {
    return next(new ForbiddenError("Only a super admin can change roles"));
  }
  next();
}
