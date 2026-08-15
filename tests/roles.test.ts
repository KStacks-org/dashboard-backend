import { createLocalJWKSet, jwtVerify } from "jose";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "@/config/env.js";
import { prisma } from "@/lib/prisma.js";
import { app, cleanupUser, createTestUser } from "./helpers.js";
import { extractCookie } from "./testUtils.js";

/**
 * Scoped admin. A super admin holds everything and is the only one who can hand
 * authority out; a "dashboard" grant is full power inside this app; a service
 * grant is mostly for the service itself, and buys exactly one thing here —
 * authority over that service's tasks and issues.
 */
describe("scoped admin roles", () => {
  const userIds: string[] = [];
  let serviceId: string;
  let serviceCodename: string;
  let otherServiceId: string;

  type Actor = { agent: ReturnType<typeof request.agent>; csrf: string; id: string };
  const agents: Record<string, Actor> = {};

  /** Named lookup so a typo fails with the key rather than a null dereference. */
  function as(key: string): Actor {
    const actor = agents[key];
    if (!actor) throw new Error(`No signed-in actor named "${key}"`);
    return actor;
  }

  async function signIn(key: string, opts: { role?: "SUPER_ADMIN" | "MEMBER" } = {}) {
    const created = await createTestUser({ mustChangePassword: false });
    userIds.push(created.user.id);
    if (opts.role === "SUPER_ADMIN") {
      await prisma.user.update({ where: { id: created.user.id }, data: { role: "SUPER_ADMIN" } });
    }
    const agent = request.agent(app);
    const login = await agent
      .post("/api/auth/login")
      .send({ email: created.user.email, password: created.tempPassword });
    agents[key] = { agent, csrf: extractCookie(login, "kstacks.csrf"), id: created.user.id };
  }

  beforeAll(async () => {
    const [first, second] = await prisma.service.findMany({
      orderBy: { sortOrder: "asc" },
      take: 2,
    });
    if (!first || !second) throw new Error("Seed the services before running this suite");
    serviceId = first.id;
    serviceCodename = first.codename;
    otherServiceId = second.id;

    await signIn("super", { role: "SUPER_ADMIN" });
    await signIn("member");
    await signIn("serviceAdmin");
    await signIn("dashboardAdmin");
  });

  afterAll(async () => {
    await prisma.task.deleteMany({ where: { createdById: { in: userIds } } });
    await Promise.all(userIds.map((id) => cleanupUser(id)));
    await prisma.$disconnect();
  });

  describe("granting", () => {
    it("refuses to let a plain member change anyone's scopes", async () => {
      const res = await as("member")
        .agent.put(`/api/team/${as("serviceAdmin").id}/grants`)
        .set("x-csrf-token", as("member").csrf)
        .send({ scopes: ["dashboard"] });
      expect(res.status).toBe(403);
    });

    it("refuses a dashboard admin too — using authority is not granting it", async () => {
      await as("super")
        .agent.put(`/api/team/${as("dashboardAdmin").id}/grants`)
        .set("x-csrf-token", as("super").csrf)
        .send({ scopes: ["dashboard"] })
        .expect(200);

      const res = await as("dashboardAdmin")
        .agent.put(`/api/team/${as("member").id}/grants`)
        .set("x-csrf-token", as("dashboardAdmin").csrf)
        .send({ scopes: ["dashboard"] });
      expect(res.status).toBe(403);
    });

    it("lets a super admin grant a service scope", async () => {
      const res = await as("super")
        .agent.put(`/api/team/${as("serviceAdmin").id}/grants`)
        .set("x-csrf-token", as("super").csrf)
        .send({ scopes: [serviceCodename] });
      expect(res.status).toBe(200);
      expect(res.body.scopes).toEqual([serviceCodename]);
    });

    it("rejects a scope that is not a real service", async () => {
      const res = await as("super")
        .agent.put(`/api/team/${as("member").id}/grants`)
        .set("x-csrf-token", as("super").csrf)
        .send({ scopes: ["not-a-service"] });
      expect(res.status).toBe(400);
    });

    it("refuses to store scopes for a super admin, who already holds them all", async () => {
      const res = await as("super")
        .agent.put(`/api/team/${as("super").id}/grants`)
        .set("x-csrf-token", as("super").csrf)
        .send({ scopes: ["dashboard"] });
      expect(res.status).toBe(400);
    });

    it("revokes by sending the set without it", async () => {
      const granted = await as("super")
        .agent.put(`/api/team/${as("member").id}/grants`)
        .set("x-csrf-token", as("super").csrf)
        .send({ scopes: [serviceCodename] });
      expect(granted.body.scopes).toEqual([serviceCodename]);

      const revoked = await as("super")
        .agent.put(`/api/team/${as("member").id}/grants`)
        .set("x-csrf-token", as("super").csrf)
        .send({ scopes: [] });
      expect(revoked.body.scopes).toEqual([]);
    });
  });

  describe("what a scope buys", () => {
    async function taskBy(key: string, body: Record<string, unknown>) {
      const res = await as(key)
        .agent.post("/api/tasks")
        .set("x-csrf-token", as(key).csrf)
        .send({ title: "Owned by someone else", assigneeIds: [as(key).id], ...body });
      return res.body.task.id as string;
    }

    it("lets a service admin delete a task attached to their service", async () => {
      const id = await taskBy("member", { serviceId });
      await as("serviceAdmin")
        .agent.delete(`/api/tasks/${id}`)
        .set("x-csrf-token", as("serviceAdmin").csrf)
        .expect(204);
    });

    it("stops that same admin at a task attached to a different service", async () => {
      const id = await taskBy("member", { serviceId: otherServiceId });
      const res = await as("serviceAdmin")
        .agent.delete(`/api/tasks/${id}`)
        .set("x-csrf-token", as("serviceAdmin").csrf);
      expect(res.status).toBe(403);
    });

    it("stops that same admin at a task attached to no service at all", async () => {
      const id = await taskBy("member", {});
      const res = await as("serviceAdmin")
        .agent.delete(`/api/tasks/${id}`)
        .set("x-csrf-token", as("serviceAdmin").csrf);
      expect(res.status).toBe(403);
    });

    it("lets a dashboard admin delete any task regardless of service", async () => {
      const id = await taskBy("member", { serviceId: otherServiceId });
      await as("dashboardAdmin")
        .agent.delete(`/api/tasks/${id}`)
        .set("x-csrf-token", as("dashboardAdmin").csrf)
        .expect(204);
    });

    it("does not let a service admin manage the roster", async () => {
      const res = await as("serviceAdmin")
        .agent.patch(`/api/team/${as("member").id}`)
        .set("x-csrf-token", as("serviceAdmin").csrf)
        .send({ jobTitle: "Should not apply" });
      expect(res.status).toBe(403);
    });

    it("does let a dashboard admin manage the roster", async () => {
      await as("dashboardAdmin")
        .agent.patch(`/api/team/${as("member").id}`)
        .set("x-csrf-token", as("dashboardAdmin").csrf)
        .send({ jobTitle: "Applied by a dashboard admin" })
        .expect(200);
    });
  });

  describe("service token", () => {
    it("signs a token that verifies against the published JWKS", async () => {
      const jwksRes = await request(app).get("/.well-known/jwks.json").expect(200);
      expect(jwksRes.body.keys[0].kty).toBe("RSA");
      // The private half must never be published.
      expect(jwksRes.body.keys[0].d).toBeUndefined();

      const tokenRes = await as("serviceAdmin").agent.get("/api/auth/token").expect(200);
      expect(tokenRes.body.tokenType).toBe("Bearer");

      const jwks = createLocalJWKSet(jwksRes.body);
      const { payload } = await jwtVerify(tokenRes.body.token, jwks, {
        issuer: env.JWT_ISSUER,
        audience: env.JWT_AUDIENCE,
      });

      expect(payload.sub).toBe(as("serviceAdmin").id);
      expect(payload.scopes).toEqual([serviceCodename]);
      expect(payload.super_admin).toBe(false);
    });

    it("marks a super admin with the wildcard claim", async () => {
      const res = await as("super").agent.get("/api/auth/token").expect(200);
      const jwks = createLocalJWKSet((await request(app).get("/.well-known/jwks.json")).body);
      const { payload } = await jwtVerify(res.body.token, jwks);
      expect(payload.super_admin).toBe(true);
    });

    it("refuses a token to someone who is not signed in", async () => {
      await request(app).get("/api/auth/token").expect(401);
    });

    it("refuses a token while a temporary password is still in place", async () => {
      const fresh = await createTestUser({ mustChangePassword: true });
      userIds.push(fresh.user.id);
      const agent = request.agent(app);
      await agent
        .post("/api/auth/login")
        .send({ email: fresh.user.email, password: fresh.tempPassword });

      const res = await agent.get("/api/auth/token");
      expect(res.status).toBe(403);
    });
  });
});
