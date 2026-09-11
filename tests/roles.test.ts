import { createLocalJWKSet, jwtVerify } from "jose";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "@/config/env.js";
import { prisma } from "@/lib/prisma.js";
import { serviceRoleScope } from "@/lib/serviceAccess.js";
import { app, cleanupUser, createTestUser, signInTestUser } from "./helpers.js";

/**
 * Scoped admin. A super admin holds everything and is the only one who can hand
 * authority out; a "dashboard-admin" grant is full power inside this app; a service
 * grant is mostly for the service itself, and buys exactly one thing here —
 * authority over that service's tasks and issues.
 */
describe("scoped admin roles", () => {
  const userIds: string[] = [];
  let serviceId: string;
  let serviceCodename: string;
  let serviceAdminScope: string;
  let serviceAccessScopeKey: string;
  let otherServiceId: string;
  let otherServiceAdminScope: string;
  let customRoleId: string | undefined;

  type Actor = { agent: ReturnType<typeof request.agent>; csrf: string; id: string };
  const agents: Record<string, Actor> = {};

  /** Named lookup so a typo fails with the key rather than a null dereference. */
  function as(key: string): Actor {
    const actor = agents[key];
    if (!actor) throw new Error(`No signed-in actor named "${key}"`);
    return actor;
  }

  async function signIn(key: string, opts: { role?: "SUPER_ADMIN" | "MEMBER" } = {}) {
    const user = await createTestUser();
    userIds.push(user.id);
    if (opts.role === "SUPER_ADMIN") {
      await prisma.user.update({ where: { id: user.id }, data: { role: "SUPER_ADMIN" } });
    }
    const { agent, csrf, id } = await signInTestUser(user);
    agents[key] = { agent, csrf, id };
  }

  beforeAll(async () => {
    const [first, second] = await prisma.service.findMany({
      orderBy: { sortOrder: "asc" },
      take: 2,
    });
    if (!first || !second) throw new Error("Seed the services before running this suite");
    serviceId = first.id;
    serviceCodename = first.codename;
    serviceAccessScopeKey = first.accessScopeKey;
    serviceAdminScope = serviceRoleScope(first.accessScopeKey, "ADMIN");
    otherServiceId = second.id;
    otherServiceAdminScope = serviceRoleScope(second.accessScopeKey, "ADMIN");

    await signIn("super", { role: "SUPER_ADMIN" });
    await signIn("member");
    await signIn("serviceAdmin");
    await signIn("dashboardAdmin");
  });

  afterAll(async () => {
    await prisma.task.deleteMany({ where: { createdById: { in: userIds } } });
    if (customRoleId) {
      await prisma.serviceAccessRole.delete({ where: { id: customRoleId } }).catch(() => {});
    }
    await Promise.all(userIds.map((id) => cleanupUser(id)));
    await prisma.$disconnect();
  });

  describe("granting", () => {
    it("refuses to let a plain member change anyone's scopes", async () => {
      const res = await as("member")
        .agent.put(`/api/team/${as("serviceAdmin").id}/grants`)
        .set("x-csrf-token", as("member").csrf)
        .send({ scopes: ["dashboard-admin"] });
      expect(res.status).toBe(403);
    });

    it("refuses a dashboard admin too — using authority is not granting it", async () => {
      await as("super")
        .agent.put(`/api/team/${as("dashboardAdmin").id}/grants`)
        .set("x-csrf-token", as("super").csrf)
        .send({ scopes: ["dashboard-admin"] })
        .expect(200);

      const res = await as("dashboardAdmin")
        .agent.put(`/api/team/${as("member").id}/grants`)
        .set("x-csrf-token", as("dashboardAdmin").csrf)
        .send({ scopes: ["dashboard-admin"] });
      expect(res.status).toBe(403);
    });

    it("refuses to let a dashboard admin promote anyone — themselves least of all", async () => {
      const res = await as("dashboardAdmin")
        .agent.patch(`/api/team/${as("dashboardAdmin").id}`)
        .set("x-csrf-token", as("dashboardAdmin").csrf)
        .send({ role: "SUPER_ADMIN" });
      expect(res.status).toBe(403);

      const unchanged = await prisma.user.findUniqueOrThrow({
        where: { id: as("dashboardAdmin").id },
      });
      expect(unchanged.role).toBe("MEMBER");
    });

    it("refuses the same thing on the way in, when adding a brand-new member", async () => {
      const res = await as("dashboardAdmin")
        .agent.post("/api/team")
        .set("x-csrf-token", as("dashboardAdmin").csrf)
        .send({
          email: `smuggled.in.${Date.now()}@stu.kau.edu.sa`,
          displayName: "Smuggled In",
          role: "SUPER_ADMIN",
        });
      expect(res.status).toBe(403);
    });

    it("still lets a dashboard admin edit someone while echoing their role back unchanged", async () => {
      await as("dashboardAdmin")
        .agent.patch(`/api/team/${as("member").id}`)
        .set("x-csrf-token", as("dashboardAdmin").csrf)
        .send({ role: "MEMBER", jobTitle: "Role left exactly as it was" })
        .expect(200);
    });

    it("lets a super admin promote and demote", async () => {
      const promoted = await as("super")
        .agent.patch(`/api/team/${as("member").id}`)
        .set("x-csrf-token", as("super").csrf)
        .send({ role: "SUPER_ADMIN" })
        .expect(200);
      expect(promoted.body.member.role).toBe("SUPER_ADMIN");

      const demoted = await as("super")
        .agent.patch(`/api/team/${as("member").id}`)
        .set("x-csrf-token", as("super").csrf)
        .send({ role: "MEMBER" })
        .expect(200);
      expect(demoted.body.member.role).toBe("MEMBER");
    });

    it("lets a super admin grant a service scope", async () => {
      const res = await as("super")
        .agent.put(`/api/team/${as("serviceAdmin").id}/grants`)
        .set("x-csrf-token", as("super").csrf)
        .send({ scopes: [serviceAdminScope] });
      expect(res.status).toBe(200);
      expect(res.body.scopes).toEqual([serviceAdminScope]);
    });

    it("only lets a super admin add, grant, and delete an uppercase custom role", async () => {
      const roleName = `MENTOR_${Date.now()}`;

      await as("member")
        .agent.post(`/api/team/scopes/${serviceId}/roles`)
        .set("x-csrf-token", as("member").csrf)
        .send({ name: roleName })
        .expect(403);

      const created = await as("super")
        .agent.post(`/api/team/scopes/${serviceId}/roles`)
        .set("x-csrf-token", as("super").csrf)
        .send({ name: roleName.toLowerCase() })
        .expect(201);

      customRoleId = created.body.scope.id;
      const customScope = serviceRoleScope(serviceAccessScopeKey, roleName);
      expect(created.body.scope).toMatchObject({
        scope: customScope,
        role: roleName,
        serviceId,
        serviceCodename,
      });

      await as("super")
        .agent.post(`/api/team/scopes/${serviceId}/roles`)
        .set("x-csrf-token", as("super").csrf)
        .send({ name: roleName })
        .expect(409);

      const granted = await as("super")
        .agent.put(`/api/team/${as("serviceAdmin").id}/grants`)
        .set("x-csrf-token", as("super").csrf)
        .send({ scopes: [serviceAdminScope, customScope] })
        .expect(200);
      expect(granted.body.scopes).toEqual([serviceAdminScope]);

      const jwks = createLocalJWKSet((await request(app).get("/.well-known/jwks.json")).body);
      const adminTokenRes = await as("serviceAdmin").agent.get("/api/auth/token").expect(200);
      const { payload: adminPayload } = await jwtVerify(adminTokenRes.body.token, jwks);
      expect(adminPayload.scopes).toBe(serviceAdminScope);

      await as("super")
        .agent.put(`/api/team/${as("serviceAdmin").id}/grants`)
        .set("x-csrf-token", as("super").csrf)
        .send({ scopes: [customScope] })
        .expect(200);

      const tokenRes = await as("serviceAdmin").agent.get("/api/auth/token").expect(200);
      const { payload } = await jwtVerify(tokenRes.body.token, jwks);
      expect(payload.scopes).toBe(customScope);

      await as("super")
        .agent.put(`/api/team/${as("member").id}/grants`)
        .set("x-csrf-token", as("super").csrf)
        .send({ scopes: [customScope] })
        .expect(200);

      const task = await as("super")
        .agent.post("/api/tasks")
        .set("x-csrf-token", as("super").csrf)
        .send({
          title: "Custom roles are not service admins",
          assigneeIds: [as("super").id],
          serviceId,
        })
        .expect(201);
      await as("member")
        .agent.delete(`/api/tasks/${task.body.task.id}`)
        .set("x-csrf-token", as("member").csrf)
        .expect(403);
      await as("super")
        .agent.delete(`/api/tasks/${task.body.task.id}`)
        .set("x-csrf-token", as("super").csrf)
        .expect(204);

      await as("super")
        .agent.put(`/api/team/${as("serviceAdmin").id}/grants`)
        .set("x-csrf-token", as("super").csrf)
        .send({ scopes: [serviceAdminScope] })
        .expect(200);

      const delegatedMember = await as("serviceAdmin")
        .agent.post("/api/team")
        .set("x-csrf-token", as("serviceAdmin").csrf)
        .send({
          email: `delegated.${Date.now()}@stu.kau.edu.sa`,
          displayName: "Delegated service member",
        })
        .expect(201);
      userIds.push(delegatedMember.body.member.id);
      expect(delegatedMember.body.member).toMatchObject({
        role: "MEMBER",
        hasDashboardAccess: false,
      });

      await as("serviceAdmin")
        .agent.patch(`/api/team/${delegatedMember.body.member.id}`)
        .set("x-csrf-token", as("serviceAdmin").csrf)
        .send({ displayName: "Service admin cannot edit profiles" })
        .expect(403);

      await as("serviceAdmin")
        .agent.post("/api/team")
        .set("x-csrf-token", as("serviceAdmin").csrf)
        .send({
          email: `forbidden.super.${Date.now()}@stu.kau.edu.sa`,
          displayName: "Forbidden super admin",
          role: "SUPER_ADMIN",
        })
        .expect(403);

      await as("super")
        .agent.put(`/api/team/${delegatedMember.body.member.id}/grants`)
        .set("x-csrf-token", as("super").csrf)
        .send({ scopes: [otherServiceAdminScope], hasDashboardAccess: false })
        .expect(200);

      const delegatedGrant = await as("serviceAdmin")
        .agent.put(`/api/team/${delegatedMember.body.member.id}/grants`)
        .set("x-csrf-token", as("serviceAdmin").csrf)
        .send({
          scopes: [otherServiceAdminScope, customScope],
          hasDashboardAccess: false,
        })
        .expect(200);
      expect(delegatedGrant.body.scopes).toEqual([customScope, otherServiceAdminScope].sort());

      await as("serviceAdmin")
        .agent.put(`/api/team/${delegatedMember.body.member.id}/grants`)
        .set("x-csrf-token", as("serviceAdmin").csrf)
        .send({ scopes: [customScope], hasDashboardAccess: false })
        .expect(403);

      await as("serviceAdmin")
        .agent.put(`/api/team/${delegatedMember.body.member.id}/grants`)
        .set("x-csrf-token", as("serviceAdmin").csrf)
        .send({
          scopes: [otherServiceAdminScope, customScope, serviceAdminScope],
          hasDashboardAccess: false,
        })
        .expect(403);

      await as("serviceAdmin")
        .agent.put(`/api/team/${delegatedMember.body.member.id}/grants`)
        .set("x-csrf-token", as("serviceAdmin").csrf)
        .send({
          scopes: [otherServiceAdminScope, customScope],
          hasDashboardAccess: true,
        })
        .expect(403);

      await as("serviceAdmin")
        .agent.post(`/api/team/scopes/${serviceId}/roles`)
        .set("x-csrf-token", as("serviceAdmin").csrf)
        .send({ name: `INSTRUCTOR_${Date.now()}` })
        .expect(403);

      await as("member")
        .agent.delete(`/api/team/scopes/${serviceId}/roles/${customRoleId}`)
        .set("x-csrf-token", as("member").csrf)
        .send({ confirmation: customScope })
        .expect(403);

      await as("super")
        .agent.delete(`/api/team/scopes/${serviceId}/roles/${customRoleId}`)
        .set("x-csrf-token", as("super").csrf)
        .send({ confirmation: roleName })
        .expect(400);

      await as("super")
        .agent.delete(`/api/team/scopes/${serviceId}/roles/${customRoleId}`)
        .set("x-csrf-token", as("super").csrf)
        .send({ confirmation: customScope })
        .expect(204);
      customRoleId = undefined;
      expect(await prisma.adminGrant.count({ where: { scope: customScope } })).toBe(0);

      const afterDeleteToken = await as("serviceAdmin").agent.get("/api/auth/token").expect(200);
      const { payload: afterDeletePayload } = await jwtVerify(afterDeleteToken.body.token, jwks);
      expect(afterDeletePayload.scopes).toBe(serviceAdminScope);

      // Keep the shared fixture in its baseline state for the token tests below.
      await Promise.all([
        as("super")
          .agent.put(`/api/team/${as("serviceAdmin").id}/grants`)
          .set("x-csrf-token", as("super").csrf)
          .send({ scopes: [serviceAdminScope] })
          .expect(200),
        as("super")
          .agent.put(`/api/team/${as("member").id}/grants`)
          .set("x-csrf-token", as("super").csrf)
          .send({ scopes: [] })
          .expect(200),
      ]);
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
        .send({ scopes: ["dashboard-admin"] });
      expect(res.status).toBe(400);
    });

    it("revokes by sending the set without it", async () => {
      const granted = await as("super")
        .agent.put(`/api/team/${as("member").id}/grants`)
        .set("x-csrf-token", as("super").csrf)
        .send({ scopes: [serviceAdminScope] });
      expect(granted.body.scopes).toEqual([serviceAdminScope]);

      const revoked = await as("super")
        .agent.put(`/api/team/${as("member").id}/grants`)
        .set("x-csrf-token", as("super").csrf)
        .send({ scopes: [] });
      expect(revoked.body.scopes).toEqual([]);
    });

    it("changes dashboard membership independently from service admin scopes", async () => {
      const serviceOnly = await as("super")
        .agent.put(`/api/team/${as("member").id}/grants`)
        .set("x-csrf-token", as("super").csrf)
        .send({ scopes: [serviceAdminScope], hasDashboardAccess: false })
        .expect(200);

      expect(serviceOnly.body).toEqual({
        scopes: [serviceAdminScope],
        hasDashboardAccess: false,
      });
      const stored = await prisma.user.findUniqueOrThrow({ where: { id: as("member").id } });
      expect(stored.hasDashboardAccess).toBe(false);

      // Restore this fixture because later cases exercise normal workspace work.
      await as("super")
        .agent.put(`/api/team/${as("member").id}/grants`)
        .set("x-csrf-token", as("super").csrf)
        .send({ scopes: [], hasDashboardAccess: true })
        .expect(200);
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
      expect(payload.scopes).toBe(serviceAdminScope);
      expect(payload.super_admin).toBe(false);
    });

    it("serializes multiple lowercase scopes as one comma-separated string", async () => {
      await as("super")
        .agent.put(`/api/team/${as("serviceAdmin").id}/grants`)
        .set("x-csrf-token", as("super").csrf)
        .send({ scopes: [serviceAdminScope, "dashboard-admin"] })
        .expect(200);

      const tokenRes = await as("serviceAdmin").agent.get("/api/auth/token").expect(200);
      const jwks = createLocalJWKSet((await request(app).get("/.well-known/jwks.json")).body);
      const { payload } = await jwtVerify(tokenRes.body.token, jwks);

      expect(payload.scopes).toBe(`${serviceAdminScope},dashboard-admin`);

      await as("super")
        .agent.put(`/api/team/${as("serviceAdmin").id}/grants`)
        .set("x-csrf-token", as("super").csrf)
        .send({ scopes: [serviceAdminScope] })
        .expect(200);
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
  });
});
