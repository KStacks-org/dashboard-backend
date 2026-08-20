import { env, isProduction } from "@/config/env.js";
import { EmailNotAllowedError, UnauthorizedError } from "@/errors/AppError.js";
import { issueServiceToken, publicJwks } from "@/lib/jwt.js";
import { asyncHandler } from "@/utils/asyncHandler.js";

const IDENTITY_COOKIES = ["access_token", "refresh_token"] as const;

export const me = asyncHandler(async (req, res) => {
  // auth-service confirmed who they are, but this app's roster doesn't (or
  // no longer does) — a different situation from never having signed in.
  if (req.deniedIdentity) throw new EmailNotAllowedError(req.deniedIdentity.email);
  if (!req.user) throw new UnauthorizedError();
  // Scopes travel with the user so the UI can decide what to offer without a
  // second request. They describe authority, never grant it — every rule is
  // still enforced server-side.
  res.json({ user: { ...req.user, adminScopes: req.grants?.scopes ?? [] } });
});

/**
 * Clears this app's view of the auth-service identity cookies. Works
 * regardless of roster status — someone denied access still needs a way to
 * sign out and try a different account. Does not call auth-service's own
 * /auth/logout; it only forgets the cookies on this side.
 */
export const logout = asyncHandler(async (_req, res) => {
  for (const name of IDENTITY_COOKIES) {
    res.clearCookie(name, {
      httpOnly: true,
      secure: isProduction,
      domain: env.COOKIE_DOMAIN,
      path: "/",
    });
  }
  res.clearCookie("kstacks.csrf", { domain: env.COOKIE_DOMAIN, path: "/" });
  res.status(204).send();
});

/**
 * Mints the token the other KStack services read. Scoped to the caller's own
 * identity — there is no way to ask for a token on someone else's behalf.
 */
export const serviceToken = asyncHandler(async (req, res) => {
  if (!req.user || !req.grants) throw new UnauthorizedError();

  const { token, expiresInSeconds } = await issueServiceToken(req.user, req.grants);
  // Authority, not a cacheable document.
  res.set("Cache-Control", "no-store");
  res.json({ token, expiresIn: expiresInSeconds, tokenType: "Bearer" });
});

/**
 * The public key set, so any service can verify a token without holding a
 * secret. Deliberately unauthenticated — that is the point of publishing it.
 */
export const jwks = asyncHandler(async (_req, res) => {
  res.set("Cache-Control", "public, max-age=3600");
  res.json(await publicJwks());
});
