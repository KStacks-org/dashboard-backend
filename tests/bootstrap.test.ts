import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { __resetBootstrapMemoForTests } from "@/lib/bootstrap.js";
import { prisma } from "@/lib/prisma.js";
import { app, cleanupUser, createTestUser, signTestAccessToken } from "./helpers.js";

/**
 * The one-time claim that gives a brand-new dashboard its first super admin,
 * so nobody has to write that row into the database by hand.
 *
 * Every test in here runs against a deliberately unowned dashboard: the whole
 * roster is demoted in beforeEach and restored afterwards. tests/setup.ts puts
 * the owner back for the suites that follow, and vitest runs test files one at
 * a time (fileParallelism: false), so no other suite ever sees this state.
 */
describe("first sign-in claims an unowned dashboard", () => {
  const createdUserIds: string[] = [];
  let ownerIds: string[] = [];

  /** An address auth-service vouches for that is on nobody's roster yet. */
  function newcomer(overrides: { email?: string; name?: string } = {}) {
    return {
      id: randomUUID(),
      email: overrides.email ?? `newcomer.${randomUUID().slice(0, 8)}@stu.kau.edu.sa`,
      displayName: overrides.name ?? "Newcomer",
    };
  }

  async function signInAs(identity: { id: string; email: string; displayName: string }) {
    const token = await signTestAccessToken(identity);
    return request(app).get("/api/auth/me").set("Cookie", `access_token=${token}`);
  }

  beforeAll(async () => {
    ownerIds = (
      await prisma.user.findMany({ where: { role: "SUPER_ADMIN" }, select: { id: true } })
    ).map((row) => row.id);
  });

  beforeEach(async () => {
    await prisma.user.updateMany({ where: { role: "SUPER_ADMIN" }, data: { role: "MEMBER" } });
    // The process caches "this dashboard has an owner" once it has seen one.
    __resetBootstrapMemoForTests();
  });

  afterEach(async () => {
    await prisma.user.updateMany({
      where: { id: { in: ownerIds } },
      data: { role: "SUPER_ADMIN" },
    });
    __resetBootstrapMemoForTests();
  });

  afterAll(async () => {
    await Promise.all(createdUserIds.map((id) => cleanupUser(id)));
    await prisma.$disconnect();
  });

  it("puts the very first person on the roster as super admin, with no row written by hand", async () => {
    const identity = newcomer({ name: "أول واحد" });
    const res = await signInAs(identity);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(identity.email);
    expect(res.body.user.role).toBe("SUPER_ADMIN");

    const created = await prisma.user.findUniqueOrThrow({ where: { email: identity.email } });
    createdUserIds.push(created.id);
    expect(created.role).toBe("SUPER_ADMIN");
    expect(created.displayName).toBe("أول واحد");
    expect(created.isActive).toBe(true);
  });

  it("closes behind the first person — the second one is a stranger again", async () => {
    const first = newcomer();
    expect((await signInAs(first)).status).toBe(200);
    createdUserIds.push(
      (await prisma.user.findUniqueOrThrow({ where: { email: first.email } })).id,
    );

    const res = await signInAs(newcomer());
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("EMAIL_NOT_ALLOWED");
  });

  it("promotes someone already seeded onto the roster instead of duplicating them", async () => {
    const seeded = await createTestUser();
    createdUserIds.push(seeded.id);

    const res = await signInAs(seeded);
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(seeded.id);
    expect(res.body.user.role).toBe("SUPER_ADMIN");

    expect(await prisma.user.count({ where: { email: seeded.email } })).toBe(1);
  });

  it("refuses an address off the allowed university domain, however early they are", async () => {
    const res = await signInAs(newcomer({ email: "outsider@gmail.com" }));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("EMAIL_NOT_ALLOWED");
    expect(await prisma.user.findUnique({ where: { email: "outsider@gmail.com" } })).toBeNull();
  });

  it("does not revive a deactivated account — switching someone off is a decision", async () => {
    const removed = await createTestUser({ isActive: false });
    createdUserIds.push(removed.id);

    const res = await signInAs(removed);
    expect(res.status).toBe(403);

    const after = await prisma.user.findUniqueOrThrow({ where: { id: removed.id } });
    expect(after.role).toBe("MEMBER");
    expect(after.isActive).toBe(false);
  });

  it("hands the dashboard to one person when several sign in at the same moment", async () => {
    const rivals = [newcomer(), newcomer(), newcomer()];
    const results = await Promise.all(rivals.map(signInAs));

    const admitted = results.filter((res) => res.status === 200);
    expect(admitted).toHaveLength(1);

    const owners = await prisma.user.findMany({
      where: { email: { in: rivals.map((r) => r.email) } },
      select: { id: true, role: true },
    });
    createdUserIds.push(...owners.map((owner) => owner.id));
    expect(owners).toHaveLength(1);
    expect(owners[0]?.role).toBe("SUPER_ADMIN");
  });
});
