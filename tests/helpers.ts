import { randomUUID } from "node:crypto";
import { createApp } from "@/app.js";
import { prisma } from "@/lib/prisma.js";
import { hashPassword } from "@/utils/password.js";

export const app = createApp();

/** Creates an isolated, throwaway user for a single test run (never touches real seed data). */
export async function createTestUser(overrides?: { mustChangePassword?: boolean }) {
  const suffix = randomUUID().slice(0, 8);
  const tempPassword = "123456";
  const user = await prisma.user.create({
    data: {
      username: `test.user.${suffix}`,
      // On the allowed domain so these fixtures can actually sign in.
      email: `test.user.${suffix}@stu.kau.edu.sa`,
      displayName: `Test User ${suffix}`,
      passwordHash: await hashPassword(tempPassword),
      mustChangePassword: overrides?.mustChangePassword ?? false,
    },
  });
  return { user, tempPassword };
}

export async function createTestService() {
  const suffix = randomUUID().slice(0, 8);
  return prisma.service.create({
    data: {
      name: `Test Service ${suffix}`,
      codename: `test-svc-${suffix}`,
      tagline: "Test tagline",
      description: "Test description",
      status: "LIVE",
      url: "https://example.test",
      sortOrder: 999,
    },
  });
}

export async function cleanupUser(userId: string) {
  await prisma.task.deleteMany({ where: { createdById: userId } });
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
}

export async function cleanupService(serviceId: string) {
  await prisma.service.delete({ where: { id: serviceId } }).catch(() => {});
}
