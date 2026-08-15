import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma.js";
import { app, cleanupUser, createTestUser } from "./helpers.js";
import { extractCookie } from "./testUtils.js";

describe("authentication", () => {
  const createdUserIds: string[] = [];

  afterAll(async () => {
    await Promise.all(createdUserIds.map((id) => cleanupUser(id)));
    await prisma.$disconnect();
  });

  it("refuses an email outside the university domain before it ever hits the database", async () => {
    for (const email of [
      "someone@gmail.com",
      "someone@kau.edu.sa",
      "someone@stu.kau.edu.sa.evil.com",
    ]) {
      const res = await request(app).post("/api/auth/login").send({ email, password: "whatever" });
      expect(res.status, `expected ${email} to be rejected`).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("refuses a malformed email", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "not-an-email", password: "whatever" });
    expect(res.status).toBe(400);
  });

  it("tells a university email that is not on the roster it is not authorised", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody.here@stu.kau.edu.sa", password: "whatever" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("EMAIL_NOT_ALLOWED");
  });

  it("accepts the email case-insensitively", async () => {
    const { user, tempPassword } = await createTestUser({ mustChangePassword: false });
    createdUserIds.push(user.id);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email.toUpperCase(), password: tempPassword });
    expect(res.status).toBe(200);
  });

  it("never returns the email allowlist through a user search to an anonymous caller", async () => {
    await request(app).get("/api/users/search").expect(401);
  });

  it("rejects a wrong password for a rostered user with a generic message", async () => {
    const { user, tempPassword } = await createTestUser();
    createdUserIds.push(user.id);
    void tempPassword;

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: "definitely-wrong" });
    expect(res.status).toBe(401);
    // Distinct from EMAIL_NOT_ALLOWED: the address is fine, the password is not.
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("logs a seeded-style user in with the temporary password and flags mustChangePassword", async () => {
    const { user, tempPassword } = await createTestUser({ mustChangePassword: true });
    createdUserIds.push(user.id);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: tempPassword });
    expect(res.status).toBe(200);
    expect(res.body.user.mustChangePassword).toBe(true);
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it("rejects protected API calls without a session", async () => {
    const res = await request(app).get("/api/tasks");
    expect(res.status).toBe(401);
  });

  it("blocks normal API access until the forced password change is completed, then unblocks it", async () => {
    const { user, tempPassword } = await createTestUser({ mustChangePassword: true });
    createdUserIds.push(user.id);
    const agent = request.agent(app);

    const loginRes = await agent
      .post("/api/auth/login")
      .send({ email: user.email, password: tempPassword });
    const csrfToken = extractCookie(loginRes, "kstacks.csrf");

    const blockedRes = await agent.get("/api/tasks");
    expect(blockedRes.status).toBe(403);
    expect(blockedRes.body.error.code).toBe("MUST_CHANGE_PASSWORD");

    const changeRes = await agent
      .post("/api/auth/change-password")
      .set("x-csrf-token", csrfToken)
      .send({
        currentPassword: tempPassword,
        newPassword: "NewPass123",
        confirmNewPassword: "NewPass123",
      });
    expect(changeRes.status).toBe(200);
    expect(changeRes.body.user.mustChangePassword).toBe(false);

    const unblockedRes = await agent.get("/api/tasks");
    expect(unblockedRes.status).toBe(200);

    // The old temporary password must stop working immediately.
    const oldLoginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: tempPassword });
    expect(oldLoginRes.status).toBe(401);

    // The new password works.
    const newLoginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: "NewPass123" });
    expect(newLoginRes.status).toBe(200);
  });

  it("rejects a change-password request whose confirmation does not match", async () => {
    const { user, tempPassword } = await createTestUser({ mustChangePassword: true });
    createdUserIds.push(user.id);
    const agent = request.agent(app);

    const loginRes = await agent
      .post("/api/auth/login")
      .send({ email: user.email, password: tempPassword });
    const csrfToken = extractCookie(loginRes, "kstacks.csrf");

    const res = await agent.post("/api/auth/change-password").set("x-csrf-token", csrfToken).send({
      currentPassword: tempPassword,
      newPassword: "NewPass123",
      confirmNewPassword: "Different123",
    });
    expect(res.status).toBe(400);
  });

  it("invalidates the session on logout", async () => {
    const { user, tempPassword } = await createTestUser({ mustChangePassword: false });
    createdUserIds.push(user.id);
    const agent = request.agent(app);

    const loginRes = await agent
      .post("/api/auth/login")
      .send({ email: user.email, password: tempPassword });
    const csrfToken = extractCookie(loginRes, "kstacks.csrf");

    const meBefore = await agent.get("/api/auth/me");
    expect(meBefore.status).toBe(200);

    await agent.post("/api/auth/logout").set("x-csrf-token", csrfToken).expect(204);

    const meAfter = await agent.get("/api/auth/me");
    expect(meAfter.status).toBe(401);
  });

  it("rejects a mutating request with a missing/invalid CSRF token", async () => {
    const { user, tempPassword } = await createTestUser({ mustChangePassword: false });
    createdUserIds.push(user.id);
    const agent = request.agent(app);

    await agent.post("/api/auth/login").send({ email: user.email, password: tempPassword });

    const res = await agent
      .post("/api/auth/change-password")
      .set("x-csrf-token", "bogus-token")
      .send({
        currentPassword: tempPassword,
        newPassword: "NewPass123",
        confirmNewPassword: "NewPass123",
      });
    expect(res.status).toBe(403);
  });
});
