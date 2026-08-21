import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma.js";
import {
  app,
  cleanupUser,
  createTestUser,
  signInTestUser,
  signTestAccessToken,
} from "./helpers.js";

describe("authentication", () => {
  const createdUserIds: string[] = [];

  afterAll(async () => {
    await Promise.all(createdUserIds.map((id) => cleanupUser(id)));
    await prisma.$disconnect();
  });

  it("treats no access_token cookie at all as anonymous", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("treats a garbled token the same as no token — not a roster rejection", async () => {
    const res = await request(app).get("/api/auth/me").set("Cookie", "access_token=not-a-jwt");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects protected API calls with no identity", async () => {
    const res = await request(app).get("/api/tasks");
    expect(res.status).toBe(401);
  });

  it("tells a valid, auth-service-verified identity that isn't on the roster it has no access — distinct from never having signed in", async () => {
    const token = await signTestAccessToken({
      id: randomUUID(),
      email: "nobody.here@stu.kau.edu.sa",
      displayName: "Nobody Here",
    });
    const res = await request(app).get("/api/auth/me").set("Cookie", `access_token=${token}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("EMAIL_NOT_ALLOWED");
    expect(res.body.error.details.email).toBe("nobody.here@stu.kau.edu.sa");
  });

  it("denies a deactivated roster member exactly like one who was never on it", async () => {
    const user = await createTestUser({ isActive: false });
    createdUserIds.push(user.id);

    const token = await signTestAccessToken(user);
    const res = await request(app).get("/api/auth/me").set("Cookie", `access_token=${token}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("EMAIL_NOT_ALLOWED");
  });

  it("matches the roster email case-insensitively", async () => {
    const user = await createTestUser();
    createdUserIds.push(user.id);

    const token = await signTestAccessToken({ ...user, email: user.email.toUpperCase() });
    const res = await request(app).get("/api/auth/me").set("Cookie", `access_token=${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(user.id);
  });

  it("signs a rostered, active user in and never leaks the password hash", async () => {
    const user = await createTestUser();
    createdUserIds.push(user.id);
    const { agent } = await signInTestUser(user);

    const res = await agent.get("/api/auth/me");
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(user.email);
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it("clears the identity cookies on logout, so the same agent goes back to anonymous", async () => {
    const user = await createTestUser();
    createdUserIds.push(user.id);
    const { agent, csrf } = await signInTestUser(user);

    await agent.get("/api/auth/me").expect(200);
    await agent.post("/api/auth/logout").set("x-csrf-token", csrf).expect(204);

    const after = await agent.get("/api/auth/me");
    expect(after.status).toBe(401);
  });

  it("lets a denied identity log out too, so they can try a different account", async () => {
    const token = await signTestAccessToken({
      id: randomUUID(),
      email: "still.nobody@stu.kau.edu.sa",
      displayName: "Still Nobody",
    });
    await request(app).post("/api/auth/logout").set("Cookie", `access_token=${token}`).expect(204);
  });

  it("rejects a mutating request with a missing or invalid CSRF token", async () => {
    const user = await createTestUser();
    createdUserIds.push(user.id);
    const { agent } = await signInTestUser(user);

    const res = await agent
      .post("/api/tasks")
      .set("x-csrf-token", "bogus-token")
      .send({ title: "Should be rejected", assigneeIds: [user.id] });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("accepts a mutating request whose CSRF header matches its cookie", async () => {
    const user = await createTestUser();
    createdUserIds.push(user.id);
    const { agent, csrf } = await signInTestUser(user);

    const res = await agent
      .post("/api/tasks")
      .set("x-csrf-token", csrf)
      .send({ title: "Should be accepted", assigneeIds: [user.id] });
    expect(res.status).toBe(201);
  });
});
