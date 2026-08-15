import type { NextFunction, Request, Response } from "express";
import { MustChangePasswordError, UnauthorizedError } from "@/errors/AppError.js";
import { prisma } from "@/lib/prisma.js";

/** Loads the current user onto req.user if a session exists; never rejects. */
export async function attachUser(req: Request, _res: Response, next: NextFunction) {
  const userId = req.session.userId;
  if (!userId) return next();

  const user = await prisma.user.findUnique({ where: { id: userId } });
  // Deactivating someone takes effect on their next request, not just at login.
  if (!user || !user.isActive) {
    req.session.userId = undefined;
    return next();
  }

  const { passwordHash: _passwordHash, ...safeUser } = user;
  req.user = safeUser;
  next();
}

/** Rejects unauthenticated requests. Must run after attachUser. */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new UnauthorizedError());
  next();
}

/**
 * Blocks access to normal app routes until the user has replaced their
 * temporary password. Auth routes (logout, change-password, me) must stay
 * reachable and mount this middleware separately/after those routes.
 */
export function blockIfMustChangePassword(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.mustChangePassword) return next(new MustChangePasswordError());
  next();
}
