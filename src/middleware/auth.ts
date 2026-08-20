import type { NextFunction, Request, Response } from "express";
import { UnauthorizedError } from "@/errors/AppError.js";
import { verifyAuthServiceToken } from "@/lib/authServiceJwt.js";
import { loadGrants } from "@/lib/authz.js";
import { prisma } from "@/lib/prisma.js";
import { ensureCsrfCookie } from "@/middleware/csrf.js";

const ACCESS_TOKEN_COOKIE = "access_token";

/**
 * Loads the current user onto req.user if auth-service's access_token cookie
 * verifies and the address is on this app's roster; never rejects.
 *
 * Two different "not signed in" outcomes are possible, and callers need to
 * tell them apart: no cookie, or one that fails verification, leaves
 * req.user unset with nothing else recorded — go through the auth-service
 * login. A *valid* token for an address this roster doesn't recognise (or
 * has deactivated) sets req.deniedIdentity instead — auth-service already
 * vouches for who they are, so sending them back through its login again
 * would just recognise them and bounce them right back here.
 */
export async function attachUser(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[ACCESS_TOKEN_COOKIE];
  if (!token) return next();

  const identity = await verifyAuthServiceToken(token).catch(() => null);
  if (!identity) return next();

  const user = await prisma.user.findUnique({ where: { email: identity.email } });
  if (!user || !user.isActive) {
    req.deniedIdentity = { email: identity.email, name: identity.name };
    return next();
  }

  const {
    passwordHash: _passwordHash,
    mustChangePassword: _mustChangePassword,
    ...safeUser
  } = user;
  req.user = safeUser;
  req.grants = await loadGrants(user.id, user.role);
  ensureCsrfCookie(req, res);
  next();
}

/** Rejects unauthenticated requests. Must run after attachUser. */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new UnauthorizedError());
  next();
}
