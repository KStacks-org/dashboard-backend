import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma.js";
import {
  app,
  cleanupService,
  cleanupUser,
  createTestService,
  createTestUser,
  signInTestUser,
} from "./helpers.js";

describe("service catalog and sponsored projects", () => {
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];
  let service: Awaited<ReturnType<typeof createTestService>>;
  let agent: ReturnType<typeof request.agent>;
  let csrf: string;
  let userId: string;

  beforeAll(async () => {
    service = await createTestService();
    const user = await createTestUser();
    createdUserIds.push(user.id);
    userId = user.id;
    ({ agent, csrf } = await signInTestUser(user));
  });

  afterAll(async () => {
    await prisma.sponsoredProject.deleteMany({ where: { id: { in: createdProjectIds } } });
    await cleanupService(service.id);
    await Promise.all(createdUserIds.map((id) => cleanupUser(id)));
    await prisma.$disconnect();
  });

  it("returns the seeded KStack services with task counts", async () => {
    const res = await agent.get("/api/services");
    expect(res.status).toBe(200);

    const codenames = res.body.services.map((s: { codename: string }) => s.codename);
    expect(codenames).toEqual(expect.arrayContaining(["kindex", "kplanner", "kgroups", "kgpa"]));
  });

  it("fetches a single service by codename and 404s on an unknown one", async () => {
    const res = await agent.get(`/api/services/${service.codename}`);
    expect(res.status).toBe(200);
    expect(res.body.service.codename).toBe(service.codename);
    expect(Array.isArray(res.body.service.tasks)).toBe(true);

    const missing = await agent.get("/api/services/does-not-exist");
    expect(missing.status).toBe(404);
  });

  it("saves the team-authored overview, owner and repo without touching catalogue fields", async () => {
    const res = await agent
      .patch(`/api/services/${service.codename}`)
      .set("x-csrf-token", csrf)
      .send({
        overview: "نبذة داخلية عن الخدمة وكيف تعمل",
        repoUrl: "https://github.com/KStacks-org/portal-frontend",
        ownerId: userId,
      });

    expect(res.status).toBe(200);
    expect(res.body.service.overview).toBe("نبذة داخلية عن الخدمة وكيف تعمل");
    expect(res.body.service.owner.id).toBe(userId);
    // Public catalogue fields are untouched.
    expect(res.body.service.name).toBe(service.name);
  });

  it("rejects a non-http repo URL", async () => {
    const res = await agent
      .patch(`/api/services/${service.codename}`)
      .set("x-csrf-token", csrf)
      .send({ repoUrl: "javascript:alert(1)" });
    expect(res.status).toBe(400);
  });

  it("reports a health overview for every service", async () => {
    const res = await agent.get("/api/services/health");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.services)).toBe(true);
    for (const entry of res.body.services) {
      expect(entry).toHaveProperty("codename");
      expect(entry).toHaveProperty("latest");
      expect(entry).toHaveProperty("uptimeRatio");
    }
  });

  it("creates, updates and deletes a sponsored project", async () => {
    const created = await agent.post("/api/sponsored-projects").set("x-csrf-token", csrf).send({
      name: "Schedly",
      description: "يولّد كل الجداول الممكنة ويختار الأفضل",
      ownerName: "ياسر الغامدي",
      projectUrl: "https://schedly.y-tools.xyz",
      status: "ACTIVE",
      resources: "استضافة + نطاق فرعي",
    });

    expect(created.status).toBe(201);
    const projectId = created.body.project.id;
    createdProjectIds.push(projectId);

    const updated = await agent
      .patch(`/api/sponsored-projects/${projectId}`)
      .set("x-csrf-token", csrf)
      .send({ status: "LAUNCHED", notes: "تم الإطلاق" });
    expect(updated.body.project.status).toBe("LAUNCHED");

    const listed = await agent.get("/api/sponsored-projects");
    expect(listed.body.projects.some((p: { id: string }) => p.id === projectId)).toBe(true);

    await agent
      .delete(`/api/sponsored-projects/${projectId}`)
      .set("x-csrf-token", csrf)
      .expect(204);

    const gone = await agent.get(`/api/sponsored-projects/${projectId}`);
    expect(gone.status).toBe(404);
  });

  it("rejects a sponsored project with no name and an invalid status", async () => {
    const noName = await agent
      .post("/api/sponsored-projects")
      .set("x-csrf-token", csrf)
      .send({ name: "", description: "d", ownerName: "o" });
    expect(noName.status).toBe(400);

    const badStatus = await agent
      .post("/api/sponsored-projects")
      .set("x-csrf-token", csrf)
      .send({ name: "n", description: "d", ownerName: "o", status: "WHATEVER" });
    expect(badStatus.status).toBe(400);
  });

  it("requires authentication for the new endpoints", async () => {
    await request(app).get("/api/services/health").expect(401);
    await request(app).get("/api/sponsored-projects").expect(401);
  });
});
