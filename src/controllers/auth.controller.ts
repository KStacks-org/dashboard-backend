import { UnauthorizedError } from "@/errors/AppError.js";
import { issueCsrfCookie } from "@/middleware/csrf.js";
import * as authService from "@/services/auth.service.js";
import { asyncHandler } from "@/utils/asyncHandler.js";
import { destroySession, regenerateSession } from "@/utils/sessionAsync.js";
import { changePasswordSchema, loginSchema } from "@/validation/auth.schema.js";

export const login = asyncHandler(async (req, res) => {
  const { username, password } = loginSchema.parse(req.body);
  const user = await authService.authenticate(username, password);

  // Regenerate the session id on privilege change to prevent session fixation.
  await regenerateSession(req);
  req.session.userId = user.id;
  issueCsrfCookie(req, res);

  res.json({ user });
});

export const logout = asyncHandler(async (req, res) => {
  await destroySession(req);
  res.clearCookie("kstacks.sid");
  res.clearCookie("kstacks.csrf");
  res.status(204).send();
});

export const me = asyncHandler(async (req, res) => {
  if (!req.user) throw new UnauthorizedError();
  res.json({ user: req.user });
});

export const changePassword = asyncHandler(async (req, res) => {
  if (!req.user) throw new UnauthorizedError();
  const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
  const user = await authService.changePassword(req.user.id, currentPassword, newPassword);
  res.json({ user });
});
