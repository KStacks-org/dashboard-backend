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

  // The roster stores addresses lowercased (see universityEmailSchema); match
  // the same way rather than trusting auth-service's casing to already agree.
  const email = identity.email.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) {
    req.deniedIdentity = { email, name: identity.name };
    return next();
  }

  req.user = user;
  req.grants = await loadGrants(user.id, user.role);
  ensureCsrfCookie(req, res);
  next();
}

/** Rejects unauthenticated requests. Must run after attachUser. */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new UnauthorizedError());
  next();
}
