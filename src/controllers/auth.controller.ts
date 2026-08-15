import { ForbiddenError, UnauthorizedError } from "@/errors/AppError.js";
import { loadGrants } from "@/lib/authz.js";
import { issueServiceToken, publicJwks } from "@/lib/jwt.js";
import { issueCsrfCookie } from "@/middleware/csrf.js";
import * as authService from "@/services/auth.service.js";
import { asyncHandler } from "@/utils/asyncHandler.js";
import { destroySession, regenerateSession } from "@/utils/sessionAsync.js";
import { changePasswordSchema, loginSchema } from "@/validation/auth.schema.js";

export const login = asyncHandler(async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const user = await authService.authenticate(email, password);

  // Regenerate the session id on privilege change to prevent session fixation.
  await regenerateSession(req);
  req.session.userId = user.id;
  issueCsrfCookie(req, res);

  const grants = await loadGrants(user.id, user.role);
  res.json({ user: { ...user, adminScopes: grants.scopes } });
});

export const logout = asyncHandler(async (req, res) => {
  await destroySession(req);
  res.clearCookie("kstacks.sid");
  res.clearCookie("kstacks.csrf");
  res.status(204).send();
});

export const me = asyncHandler(async (req, res) => {
  if (!req.user) throw new UnauthorizedError();
  // Scopes travel with the user so the UI can decide what to offer without a
  // second request. They describe authority, never grant it — every rule is
  // still enforced server-side.
  res.json({ user: { ...req.user, adminScopes: req.grants?.scopes ?? [] } });
});

export const changePassword = asyncHandler(async (req, res) => {
  if (!req.user) throw new UnauthorizedError();
  const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
  const user = await authService.changePassword(req.user.id, currentPassword, newPassword);
  res.json({ user });
});

/**
 * Mints the token the other KStack services read. Scoped to the caller's own
 * session — there is no way to ask for a token on someone else's behalf — and
 * refused while a temporary password is still in place, so an unclaimed account
 * can never hand out authority.
 */
export const serviceToken = asyncHandler(async (req, res) => {
  if (!req.user || !req.grants) throw new UnauthorizedError();
  if (req.user.mustChangePassword) {
    throw new ForbiddenError("Change your password before requesting a service token");
  }

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
