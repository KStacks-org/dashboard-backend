import type { NextFunction, Request, Response } from "express";
import { ForbiddenError, UnauthorizedError } from "@/errors/AppError.js";

/**
 * Roster management is the one admin-only area — everything else in the
 * dashboard stays equal-permission between team members.
 */
export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new UnauthorizedError());
  if (req.user.role !== "ADMIN") {
    return next(new ForbiddenError("Only an admin can manage the team"));
  }
  next();
}
