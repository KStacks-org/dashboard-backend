/**
 * Creates/removes throwaway roster accounts for the Playwright suite.
 *
 * Run out-of-band by the E2E global setup/teardown rather than exposed as an HTTP
 * route, so the production server never ships a user-creation backdoor. Every
 * operation is confined to the `e2e.` username prefix, so it can't touch the real
 * team's accounts even if invoked by mistake.
 *
 * Sign-in itself goes through auth-service now, not this app — these fixtures
 * only need to exist on the roster, so specs can sign a test token for
 * whichever email a fixture was created with (see frontend/e2e/testAuth.ts)
 * and land straight in as that person, no login form involved.
 *
 *   pnpm --filter backend exec tsx scripts/e2e-fixtures.ts setup
 *   pnpm --filter backend exec tsx scripts/e2e-fixtures.ts teardown
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PREFIX = "e2e.";

const FIXTURES = [
  {
    username: `${PREFIX}rotated`,
    email: `${PREFIX}rotated@stu.kau.edu.sa`,
    displayName: "اختبار مُفعَّل",
  },
  {
    username: `${PREFIX}fresh`,
    email: `${PREFIX}fresh@stu.kau.edu.sa`,
    displayName: "اختبار جديد",
  },
  { username: `${PREFIX}other`, email: `${PREFIX}other@stu.kau.edu.sa`, displayName: "اختبار آخر" },
] as const;

async function setup() {
  const users = [];
  for (const fixture of FIXTURES) {
    // Re-running resets the account to a known state so reruns are deterministic.
    const user = await prisma.user.upsert({
      where: { username: fixture.username },
      update: { email: fixture.email, displayName: fixture.displayName, isActive: true },
      create: fixture,
    });
    users.push({ id: user.id, email: user.email, displayName: user.displayName });
  }

  // The only output on stdout, so global-setup can parse it — everything
  // else here should go to stderr if it needs to be human-visible.
  console.log(JSON.stringify({ users }));
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

  console.error(`Removed ${ids.length} E2E users.`);
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
