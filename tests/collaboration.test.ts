import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma.js";
import { app, cleanupUser, createTestUser } from "./helpers.js";
import { extractCookie } from "./testUtils.js";

describe("subtask ownership, comments and links", () => {
  const createdUserIds: string[] = [];
  let ownerAgent: ReturnType<typeof request.agent>;
  let ownerCsrf: string;
  let ownerId: string;
  let helperId: string;
  let outsiderId: string;
  let otherAgent: ReturnType<typeof request.agent>;
  let otherCsrf: string;

  const createTask = async (assigneeIds: string[]) => {
    const res = await ownerAgent
      .post("/api/tasks")
      .set("x-csrf-token", ownerCsrf)
      .send({ title: `Task ${Date.now()}-${Math.random()}`, assigneeIds });
    expect(res.status).toBe(201);
    return res.body.task;
  };

  beforeAll(async () => {
    const owner = await createTestUser({ mustChangePassword: false });
    createdUserIds.push(owner.user.id);
    ownerId = owner.user.id;
    ownerAgent = request.agent(app);
    const ownerLogin = await ownerAgent
      .post("/api/auth/login")
      .send({ username: owner.user.username, password: owner.tempPassword });
    ownerCsrf = extractCookie(ownerLogin, "kstacks.csrf");

    const helper = await createTestUser({ mustChangePassword: false });
    createdUserIds.push(helper.user.id);
    helperId = helper.user.id;

    const outsider = await createTestUser({ mustChangePassword: false });
    createdUserIds.push(outsider.user.id);
    outsiderId = outsider.user.id;
    otherAgent = request.agent(app);
    const otherLogin = await otherAgent
      .post("/api/auth/login")
      .send({ username: outsider.user.username, password: outsider.tempPassword });
    otherCsrf = extractCookie(otherLogin, "kstacks.csrf");
  });

  afterAll(async () => {
    await Promise.all(createdUserIds.map((id) => cleanupUser(id)));
    await prisma.$disconnect();
  });

  it("gives every task a unique, human-readable reference number", async () => {
    const first = await createTask([ownerId]);
    const second = await createTask([ownerId]);

    expect(typeof first.reference).toBe("number");
    expect(second.reference).toBeGreaterThan(first.reference);
  });

  it("assigns a subtask to someone who is on the parent task", async () => {
    const task = await createTask([ownerId, helperId]);

    const res = await ownerAgent
      .post(`/api/tasks/${task.id}/subtasks`)
      .set("x-csrf-token", ownerCsrf)
      .send({ title: "Draft the spec", assigneeId: helperId });

    expect(res.status).toBe(201);
    expect(res.body.subtask.assignee.id).toBe(helperId);
  });

  it("refuses to assign a subtask to someone who is not on the parent task", async () => {
    const task = await createTask([ownerId]);

    const res = await ownerAgent
      .post(`/api/tasks/${task.id}/subtasks`)
      .set("x-csrf-token", ownerCsrf)
      .send({ title: "Draft the spec", assigneeId: outsiderId });

    expect(res.status).toBe(400);
  });

  it("blocks removing a task assignee who still owns subtasks, and names them", async () => {
    const task = await createTask([ownerId, helperId]);
    await ownerAgent
      .post(`/api/tasks/${task.id}/subtasks`)
      .set("x-csrf-token", ownerCsrf)
      .send({ title: "Helper's piece", assigneeId: helperId })
      .expect(201);

    const res = await ownerAgent
      .patch(`/api/tasks/${task.id}`)
      .set("x-csrf-token", ownerCsrf)
      .send({ assigneeIds: [ownerId] });

    expect(res.status).toBe(409);
    expect(res.body.error.details.blockedBy).toEqual([
      expect.objectContaining({ id: helperId }),
    ]);

    // The assignee list is untouched by the rejected update.
    const after = await ownerAgent.get(`/api/tasks/${task.id}`);
    expect(after.body.task.assignees).toHaveLength(2);
  });

  it("allows the removal once the subtask has been handed over", async () => {
    const task = await createTask([ownerId, helperId]);
    const subtaskRes = await ownerAgent
      .post(`/api/tasks/${task.id}/subtasks`)
      .set("x-csrf-token", ownerCsrf)
      .send({ title: "Helper's piece", assigneeId: helperId });

    await ownerAgent
      .patch(`/api/subtasks/${subtaskRes.body.subtask.id}`)
      .set("x-csrf-token", ownerCsrf)
      .send({ assigneeId: ownerId })
      .expect(200);

    const res = await ownerAgent
      .patch(`/api/tasks/${task.id}`)
      .set("x-csrf-token", ownerCsrf)
      .send({ assigneeIds: [ownerId] });

    expect(res.status).toBe(200);
    expect(res.body.task.assignees).toHaveLength(1);
  });

  it("reorders subtasks and rejects an order that does not match the task", async () => {
    const task = await createTask([ownerId]);
    const titles = ["First", "Second", "Third"];
    const ids: string[] = [];
    for (const title of titles) {
      const res = await ownerAgent
        .post(`/api/tasks/${task.id}/subtasks`)
        .set("x-csrf-token", ownerCsrf)
        .send({ title });
      ids.push(res.body.subtask.id);
    }

    const reversed = [...ids].reverse();
    const res = await ownerAgent
      .patch(`/api/tasks/${task.id}/subtasks/reorder`)
      .set("x-csrf-token", ownerCsrf)
      .send({ orderedIds: reversed });

    expect(res.status).toBe(200);
    expect(res.body.subtasks.map((s: { title: string }) => s.title)).toEqual([
      "Third",
      "Second",
      "First",
    ]);

    // A partial order would silently renumber the rest — reject it.
    const partial = await ownerAgent
      .patch(`/api/tasks/${task.id}/subtasks/reorder`)
      .set("x-csrf-token", ownerCsrf)
      .send({ orderedIds: [ids[0]] });
    expect(partial.status).toBe(400);
  });

  it("moves a task between workflow statuses", async () => {
    const task = await createTask([ownerId]);
    expect(task.status).toBe("TODO");

    const res = await ownerAgent
      .patch(`/api/tasks/${task.id}`)
      .set("x-csrf-token", ownerCsrf)
      .send({ status: "IN_PROGRESS" });
    expect(res.body.task.status).toBe("IN_PROGRESS");

    const invalid = await ownerAgent
      .patch(`/api/tasks/${task.id}`)
      .set("x-csrf-token", ownerCsrf)
      .send({ status: "DONE" });
    expect(invalid.status).toBe(400);
  });

  it("lets anyone comment but only the author edit or delete their comment", async () => {
    const task = await createTask([ownerId]);

    const created = await otherAgent
      .post(`/api/tasks/${task.id}/comments`)
      .set("x-csrf-token", otherCsrf)
      .send({ body: "أنا واقف على مراجعة التصميم" });
    expect(created.status).toBe(201);
    const commentId = created.body.comment.id;
    expect(created.body.comment.author.id).toBe(outsiderId);

    const forbidden = await ownerAgent
      .patch(`/api/comments/${commentId}`)
      .set("x-csrf-token", ownerCsrf)
      .send({ body: "edited by someone else" });
    expect(forbidden.status).toBe(403);

    const edited = await otherAgent
      .patch(`/api/comments/${commentId}`)
      .set("x-csrf-token", otherCsrf)
      .send({ body: "خلصت المراجعة" });
    expect(edited.body.comment.body).toBe("خلصت المراجعة");

    const forbiddenDelete = await ownerAgent
      .delete(`/api/comments/${commentId}`)
      .set("x-csrf-token", ownerCsrf);
    expect(forbiddenDelete.status).toBe(403);

    await otherAgent
      .delete(`/api/comments/${commentId}`)
      .set("x-csrf-token", otherCsrf)
      .expect(204);
  });

  it("rejects an empty comment", async () => {
    const task = await createTask([ownerId]);
    const res = await ownerAgent
      .post(`/api/tasks/${task.id}/comments`)
      .set("x-csrf-token", ownerCsrf)
      .send({ body: "   " });
    expect(res.status).toBe(400);
  });

  it("stores http links and rejects dangerous schemes", async () => {
    const task = await createTask([ownerId]);

    const ok = await ownerAgent
      .post(`/api/tasks/${task.id}/links`)
      .set("x-csrf-token", ownerCsrf)
      .send({ url: "https://github.com/KStacks-org/portal-frontend/pull/1", label: "PR" });
    expect(ok.status).toBe(201);

    for (const url of ["javascript:alert(1)", "data:text/html,<script>", "not-a-url"]) {
      const res = await ownerAgent
        .post(`/api/tasks/${task.id}/links`)
        .set("x-csrf-token", ownerCsrf)
        .send({ url });
      expect(res.status, `expected ${url} to be rejected`).toBe(400);
    }

    const reloaded = await ownerAgent.get(`/api/tasks/${task.id}`);
    expect(reloaded.body.task.links).toHaveLength(1);

    await ownerAgent
      .delete(`/api/links/${ok.body.link.id}`)
      .set("x-csrf-token", ownerCsrf)
      .expect(204);
  });
});
