import { BadRequestError, UnauthorizedError } from "@/errors/AppError.js";
import { prisma } from "@/lib/prisma.js";
import { hashPassword, verifyPassword } from "@/utils/password.js";

export async function authenticate(username: string, password: string) {
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) throw new UnauthorizedError("Invalid username or password");

  const valid = await verifyPassword(user.passwordHash, password);
  if (!valid) throw new UnauthorizedError("Invalid username or password");

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
