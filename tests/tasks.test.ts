import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma.js";
import { app, cleanupService, cleanupUser, createTestService, createTestUser } from "./helpers.js";
import { extractCookie } from "./testUtils.js";

describe("tasks", () => {
  const createdUserIds: string[] = [];
  let service: Awaited<ReturnType<typeof createTestService>>;
  let creatorAgent: ReturnType<typeof request.agent>;
  let creatorCsrf: string;
  let creatorId: string;
  let otherAgent: ReturnType<typeof request.agent>;
  let otherCsrf: string;
  let assigneeId: string;

  beforeAll(async () => {
    service = await createTestService();

    const creator = await createTestUser({ mustChangePassword: false });
    createdUserIds.push(creator.user.id);
    creatorId = creator.user.id;
    creatorAgent = request.agent(app);
    const creatorLogin = await creatorAgent
      .post("/api/auth/login")
      .send({ username: creator.user.username, password: creator.tempPassword });
    creatorCsrf = extractCookie(creatorLogin, "kstacks.csrf");

    const other = await createTestUser({ mustChangePassword: false });
    createdUserIds.push(other.user.id);
    otherAgent = request.agent(app);
    const otherLogin = await otherAgent
      .post("/api/auth/login")
      .send({ username: other.user.username, password: other.tempPassword });
    otherCsrf = extractCookie(otherLogin, "kstacks.csrf");

    const assignee = await createTestUser({ mustChangePassword: false });
    createdUserIds.push(assignee.user.id);
    assigneeId = assignee.user.id;
  });

  afterAll(async () => {
    await cleanupService(service.id);
    await Promise.all(createdUserIds.map((id) => cleanupUser(id)));
    await prisma.$disconnect();
  });

  it("rejects a task with no title", async () => {
    const res = await creatorAgent
      .post("/api/tasks")
      .set("x-csrf-token", creatorCsrf)
      .send({ title: "", assigneeIds: [assigneeId] });
    expect(res.status).toBe(400);
  });

  it("rejects a task with no assignees", async () => {
    const res = await creatorAgent
      .post("/api/tasks")
      .set("x-csrf-token", creatorCsrf)
      .send({ title: "Ship the report", assigneeIds: [] });
    expect(res.status).toBe(400);
  });

  it("rejects a task with a duplicate assignee in the same request", async () => {
    const res = await creatorAgent
      .post("/api/tasks")
      .set("x-csrf-token", creatorCsrf)
      .send({ title: "Ship the report", assigneeIds: [assigneeId, assigneeId] });
    expect(res.status).toBe(400);
  });

  it("rejects an invalid priority value", async () => {
    const res = await creatorAgent
      .post("/api/tasks")
      .set("x-csrf-token", creatorCsrf)
      .send({ title: "Ship the report", priority: "URGENT", assigneeIds: [assigneeId] });
    expect(res.status).toBe(400);
  });

  it("rejects a non-existent service id", async () => {
    const res = await creatorAgent
      .post("/api/tasks")
      .set("x-csrf-token", creatorCsrf)
      .send({
        title: "Ship the report",
        assigneeIds: [assigneeId],
        serviceId: "00000000-0000-0000-0000-000000000000",
      });
    expect([400, 404]).toContain(res.status);
  });

  it("creates a task with title, description, deadline, priority, service and multiple assignees, and persists it", async () => {
    const deadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const createRes = await creatorAgent
      .post("/api/tasks")
      .set("x-csrf-token", creatorCsrf)
      .send({
        title: "Ship the onboarding doc",
        description: "Write and publish the new-member onboarding guide",
        deadline,
        priority: "HIGH",
        serviceId: service.id,
        assigneeIds: [assigneeId, creatorId],
      });
    expect(createRes.status).toBe(201);
    const taskId = createRes.body.task.id;
    expect(createRes.body.task.assignees).toHaveLength(2);
    expect(createRes.body.task.priority).toBe("HIGH");
    expect(createRes.body.task.service.id).toBe(service.id);

    // Reload from a fresh request to confirm it was actually persisted, not just echoed back.
    const getRes = await creatorAgent.get(`/api/tasks/${taskId}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.task.title).toBe("Ship the onboarding doc");
    expect(getRes.body.task.deadline).toBe(deadline);
    expect(
      new Set(getRes.body.task.assignees.map((a: { user: { id: string } }) => a.user.id)),
    ).toEqual(new Set([assigneeId, creatorId]));

    // Appears in the active list.
    const listRes = await creatorAgent.get("/api/tasks");
    expect(listRes.body.tasks.some((t: { id: string }) => t.id === taskId)).toBe(true);
  });

  it("adds, completes, and deletes subtasks under a task", async () => {
    const createRes = await creatorAgent
      .post("/api/tasks")
      .set("x-csrf-token", creatorCsrf)
      .send({ title: "Task with subtasks", assigneeIds: [creatorId] });
    const taskId = createRes.body.task.id;

    const subtaskRes = await creatorAgent
      .post(`/api/tasks/${taskId}/subtasks`)
      .set("x-csrf-token", creatorCsrf)
      .send({ title: "Write the first draft" });
    expect(subtaskRes.status).toBe(201);
    const subtaskId = subtaskRes.body.subtask.id;
    expect(subtaskRes.body.subtask.isCompleted).toBe(false);

    const completeRes = await creatorAgent
      .patch(`/api/subtasks/${subtaskId}`)
      .set("x-csrf-token", creatorCsrf)
      .send({ isCompleted: true });
    expect(completeRes.status).toBe(200);
    expect(completeRes.body.subtask.isCompleted).toBe(true);

    const uncompleteRes = await creatorAgent
      .patch(`/api/subtasks/${subtaskId}`)
      .set("x-csrf-token", creatorCsrf)
      .send({ isCompleted: false });
    expect(uncompleteRes.body.subtask.isCompleted).toBe(false);

    const getRes = await creatorAgent.get(`/api/tasks/${taskId}`);
    expect(getRes.body.task.subtasks).toHaveLength(1);

    await creatorAgent
      .delete(`/api/subtasks/${subtaskId}`)
      .set("x-csrf-token", creatorCsrf)
      .expect(204);

    const afterDelete = await creatorAgent.get(`/api/tasks/${taskId}`);
    expect(afterDelete.body.task.subtasks).toHaveLength(0);
  });

  it("archives a finished task instead of deleting it, and can restore it", async () => {
    const createRes = await creatorAgent
      .post("/api/tasks")
      .set("x-csrf-token", creatorCsrf)
      .send({ title: "Task to archive", assigneeIds: [creatorId] });
    const taskId = createRes.body.task.id;

    const archiveRes = await creatorAgent
      .post(`/api/tasks/${taskId}/archive`)
      .set("x-csrf-token", creatorCsrf)
      .send();
    expect(archiveRes.status).toBe(200);
    expect(archiveRes.body.task.isArchived).toBe(true);

    const activeList = await creatorAgent.get("/api/tasks?archived=false");
    expect(activeList.body.tasks.some((t: { id: string }) => t.id === taskId)).toBe(false);

    const archivedList = await creatorAgent.get("/api/tasks?archived=true");
    expect(archivedList.body.tasks.some((t: { id: string }) => t.id === taskId)).toBe(true);

    const restoreRes = await creatorAgent
      .post(`/api/tasks/${taskId}/restore`)
      .set("x-csrf-token", creatorCsrf)
      .send();
    expect(restoreRes.body.task.isArchived).toBe(false);

    // Clean up directly since this task isn't asserted on further.
    await creatorAgent.delete(`/api/tasks/${taskId}`).set("x-csrf-token", creatorCsrf);
  });

  it("only lets the task's creator delete it", async () => {
    const createRes = await creatorAgent
      .post("/api/tasks")
      .set("x-csrf-token", creatorCsrf)
      .send({ title: "Task only the creator can delete", assigneeIds: [creatorId, assigneeId] });
    const taskId = createRes.body.task.id;

    const forbiddenRes = await otherAgent
      .delete(`/api/tasks/${taskId}`)
      .set("x-csrf-token", otherCsrf)
      .send();
    expect(forbiddenRes.status).toBe(403);

    // Still there.
    const stillThere = await creatorAgent.get(`/api/tasks/${taskId}`);
    expect(stillThere.status).toBe(200);

    const okRes = await creatorAgent
      .delete(`/api/tasks/${taskId}`)
      .set("x-csrf-token", creatorCsrf)
      .send();
    expect(okRes.status).toBe(204);

    const goneRes = await creatorAgent.get(`/api/tasks/${taskId}`);
    expect(goneRes.status).toBe(404);
  });
});
