import { BadRequestError, EmailNotAllowedError, UnauthorizedError } from "@/errors/AppError.js";
import { prisma } from "@/lib/prisma.js";
import { hashPassword, verifyPassword } from "@/utils/password.js";

/**
 * There is no public sign-up, so the users table is the allowlist: an address
 * nobody on the roster owns is refused outright, while a known address with the
 * wrong password gets the usual generic message.
 */
export async function authenticate(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new EmailNotAllowedError();

  const valid = await verifyPassword(user.passwordHash, password);
  if (!valid) throw new UnauthorizedError("Invalid email or password");

  const { passwordHash: _passwordHash, ...safeUser } = user;
  return safeUser;
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new UnauthorizedError();

  const valid = await verifyPassword(user.passwordHash, currentPassword);
  if (!valid) throw new BadRequestError("Current password is incorrect");

  const newHash = await hashPassword(newPassword);
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: newHash, mustChangePassword: false },
  });

  const { passwordHash: _passwordHash, ...safeUser } = updated;
  return safeUser;
}
