import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { isProduction } from "@/config/env.js";
import { ForbiddenError } from "@/errors/AppError.js";

const CSRF_COOKIE = "kstacks.csrf";
const CSRF_HEADER = "x-csrf-token";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function issueCsrfCookie(req: Request, res: Response) {
  const token = req.session.csrfToken ?? crypto.randomBytes(32).toString("hex");
  req.session.csrfToken = token;
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false, // must be readable by the frontend to echo back in a header
    secure: isProduction,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

/** Double-submit-cookie CSRF check for state-changing requests. */
export function verifyCsrf(req: Request, _res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) return next();

  const expected = req.session.csrfToken;
  const provided = req.header(CSRF_HEADER);

  if (!expected || !provided || provided !== expected) {
    return next(new ForbiddenError("Invalid or missing CSRF token"));
  }
  next();
}
