import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { env, isProduction } from "@/config/env.js";
import { ForbiddenError } from "@/errors/AppError.js";

const CSRF_COOKIE = "kstacks.csrf";
const CSRF_HEADER = "x-csrf-token";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Issues a CSRF cookie if the caller doesn't already have one. Called from
 * attachUser on every authenticated request rather than at a single login
 * moment — there is no dashboard-side login step anymore, identity arrives
 * pre-established via auth-service's cookie.
 */
export function ensureCsrfCookie(req: Request, res: Response) {
  if (req.cookies?.[CSRF_COOKIE]) return;
  const token = crypto.randomBytes(32).toString("hex");
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false, // must be readable by the frontend to echo back in a header
    secure: isProduction,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    domain: env.COOKIE_DOMAIN,
  });
}

/**
 * Double-submit-cookie CSRF check for state-changing requests: the value
 * must arrive twice, once as a cookie and once as a header. A cross-site page
 * can make the browser attach the cookie automatically, but it cannot read
 * the cookie's value to also set the header — so a forged request can supply
 * at most one of the two. Stateless by design: no session to compare against.
 */
export function verifyCsrf(req: Request, _res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) return next();

  const expected = req.cookies?.[CSRF_COOKIE];
  const provided = req.header(CSRF_HEADER);

  if (!expected || !provided || provided !== expected) {
    return next(new ForbiddenError("Invalid or missing CSRF token"));
  }
  next();
}
