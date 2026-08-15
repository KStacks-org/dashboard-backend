import type { NextFunction, Request, Response } from "express";
import { ForbiddenError, UnauthorizedError } from "@/errors/AppError.js";
import { canAdministerDashboard } from "@/lib/authz.js";

/**
 * Full authority inside this app — held by a super admin, or by anyone granted
 * the "dashboard" scope. Everything not gated by this stays equal-permission
 * between team members.
 */
export function requireDashboardAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user || !req.grants) return next(new UnauthorizedError());
  if (!canAdministerDashboard(req.grants)) {
    return next(new ForbiddenError("Only a dashboard admin can do that"));
  }
  next();
}

/**
 * Granting and revoking admin is deliberately narrower than using it: only a
 * super admin can change who holds what, so authority always has one source.
 */
export function requireSuperAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user || !req.grants) return next(new UnauthorizedError());
  if (!req.grants.isSuperAdmin) {
    return next(new ForbiddenError("Only a super admin can change roles"));
  }
  next();
}
