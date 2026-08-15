/**
 * Creates/removes throwaway accounts for the Playwright suite.
 *
 * Run out-of-band by the E2E global setup/teardown rather than exposed as an HTTP
 * route, so the production server never ships a user-creation backdoor. Every
 * operation is confined to the `e2e.` username prefix, so it can't touch the real
 * team's accounts even if invoked by mistake.
 *
 *   pnpm --filter backend exec tsx scripts/e2e-fixtures.ts setup
 *   pnpm --filter backend exec tsx scripts/e2e-fixtures.ts teardown
 */
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/utils/password.js";

const prisma = new PrismaClient();

const PREFIX = "e2e.";
const PASSWORD = "123456";

const FIXTURES = [
  {
    username: `${PREFIX}rotated`,
    email: `${PREFIX}rotated@stu.kau.edu.sa`,
    displayName: "اختبار مُفعَّل",
    mustChangePassword: false,
  },
  {
    username: `${PREFIX}fresh`,
    email: `${PREFIX}fresh@stu.kau.edu.sa`,
    displayName: "اختبار جديد",
    mustChangePassword: true,
  },
  {
    username: `${PREFIX}other`,
    email: `${PREFIX}other@stu.kau.edu.sa`,
    displayName: "اختبار آخر",
    mustChangePassword: false,
  },
] as const;

async function setup() {
  const passwordHash = await hashPassword(PASSWORD);

  for (const fixture of FIXTURES) {
    await prisma.user.upsert({
      where: { username: fixture.username },
      // Re-running resets the account to a known state so reruns are deterministic.
      update: {
        email: fixture.email,
        displayName: fixture.displayName,
        passwordHash,
        mustChangePassword: fixture.mustChangePassword,
      },
      create: { ...fixture, passwordHash },
    });
  }

  console.log(JSON.stringify({ password: PASSWORD, users: FIXTURES }, null, 2));
}

async function teardown() {
  const users = await prisma.user.findMany({
    where: { username: { startsWith: PREFIX } },
    select: { id: true },
  });
  const ids = users.map((user) => user.id);

  // Tasks are restrict-deleted on creator, so remove authored tasks first.
  await prisma.task.deleteMany({ where: { createdById: { in: ids } } });
  await prisma.user.deleteMany({ where: { username: { startsWith: PREFIX } } });

  console.log(`Removed ${ids.length} E2E users.`);
}

const command = process.argv[2];

const run = command === "setup" ? setup : command === "teardown" ? teardown : null;

if (!run) {
  console.error("Usage: tsx scripts/e2e-fixtures.ts <setup|teardown>");
  process.exit(1);
}

run()
  .catch((error) => {
    console.error("E2E fixture command failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
