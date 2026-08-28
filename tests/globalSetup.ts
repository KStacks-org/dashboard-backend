// Runs outside the app, so nothing has read .env yet.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { TEST_OWNER_USERNAME } from "./testUtils.js";

/**
 * Gives the dashboard an owner for the duration of the run, and takes it away
 * again afterwards.
 *
 * A database with no super admin is a live bootstrap (see src/lib/bootstrap.ts):
 * the next person to sign in is promoted, which would otherwise hand the
 * highest authority in the app to whichever fixture user a suite happened to
 * sign in first. Every suite except tests/bootstrap.test.ts assumes that
 * already happened, so an owner is stood up before anything runs.
 *
 * A dedicated account rather than one of the seeded people, so the real roster
 * is left exactly as prisma/seed.ts wrote it — and removed at the end, so
 * pointing the suite at a development database doesn't leave a permanent super
 * admin sitting on the Team page.
 *
 * Both hooks run in their own process, hence their own client.
 */
export async function setup() {
  const prisma = new PrismaClient();
  try {
    await prisma.user.upsert({
      where: { username: TEST_OWNER_USERNAME },
      update: { role: "SUPER_ADMIN", isActive: true },
      create: {
        username: TEST_OWNER_USERNAME,
        email: `${TEST_OWNER_USERNAME}@stu.kau.edu.sa`,
        displayName: "Test Dashboard Owner",
        role: "SUPER_ADMIN",
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}

export async function teardown() {
  const prisma = new PrismaClient();
  try {
    await prisma.user.delete({ where: { username: TEST_OWNER_USERNAME } });
  } catch {
    // Already gone, or held down by a row some suite left behind — a leftover
    // fixture is not worth failing an otherwise green run over.
  } finally {
    await prisma.$disconnect();
  }
}
