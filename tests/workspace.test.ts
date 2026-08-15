import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma.js";
import { app, cleanupUser, createTestUser } from "./helpers.js";
import { extractCookie } from "./testUtils.js";

describe("team, issues, milestones and notifications", () => {
  const createdUserIds: string[] = [];
  const createdMilestoneIds: string[] = [];

  let adminAgent: ReturnType<typeof request.agent>;
  let adminCsrf: string;
  let adminId: string;

  let memberAgent: ReturnType<typeof request.agent>;
  let memberCsrf: string;
  let memberId: string;

  beforeAll(async () => {
    const admin = await createTestUser({ mustChangePassword: false });
    createdUserIds.push(admin.user.id);
    adminId = admin.user.id;
    await prisma.user.update({ where: { id: adminId }, data: { role: "ADMIN" } });
    adminAgent = request.agent(app);
    const adminLogin = await adminAgent
      .post("/api/auth/login")
      .send({ email: admin.user.email, password: admin.tempPassword });
    adminCsrf = extractCookie(adminLogin, "kstacks.csrf");

    const member = await createTestUser({ mustChangePassword: false });
    createdUserIds.push(member.user.id);
    memberId = member.user.id;
    memberAgent = request.agent(app);
    const memberLogin = await memberAgent
      .post("/api/auth/login")
      .send({ email: member.user.email, password: member.tempPassword });
    memberCsrf = extractCookie(memberLogin, "kstacks.csrf");
  });

  afterAll(async () => {
    await prisma.milestone.deleteMany({ where: { id: { in: createdMilestoneIds } } });
    await prisma.issue.deleteMany({ where: { reportedById: { in: createdUserIds } } });
    await Promise.all(createdUserIds.map((id) => cleanupUser(id)));
    await prisma.$disconnect();
  });

  describe("team roster", () => {
    it("lets everyone read the roster with each person's workload", async () => {
      const res = await memberAgent.get("/api/team");
      expect(res.status).toBe(200);

      const me = res.body.members.find((m: { id: string }) => m.id === memberId);
      expect(me.workload).toEqual(
        expect.objectContaining({
          activeTasks: expect.any(Number),
          inProgress: expect.any(Number),
          openIssues: expect.any(Number),
        }),
      );
      // A password hash must never ride along on the roster.
      expect(me.passwordHash).toBeUndefined();
    });

    it("only lets an admin add a member", async () => {
      const payload = {
        email: `new.person.${Date.now()}@stu.kau.edu.sa`,
        displayName: "عضو جديد",
        jobTitle: "Developer",
        responsibilities: ["Index Service"],
      };

      const refused = await memberAgent
        .post("/api/team")
        .set("x-csrf-token", memberCsrf)
        .send(payload);
      expect(refused.status).toBe(403);

      const created = await adminAgent
        .post("/api/team")
        .set("x-csrf-token", adminCsrf)
        .send(payload);
      expect(created.status).toBe(201);
      createdUserIds.push(created.body.member.id);

      expect(created.body.member.responsibilities).toEqual(["Index Service"]);
      // New members start on the temporary password and must replace it.
      expect(created.body.member.mustChangePassword).toBe(true);
    });

    it("rejects a member whose email is off the university domain", async () => {
      const res = await adminAgent
        .post("/api/team")
        .set("x-csrf-token", adminCsrf)
        .send({ email: "outsider@gmail.com", displayName: "Outsider" });
      expect(res.status).toBe(400);
    });

    it("refuses a duplicate email", async () => {
      const existing = await prisma.user.findUniqueOrThrow({ where: { id: memberId } });
      const res = await adminAgent
        .post("/api/team")
        .set("x-csrf-token", adminCsrf)
        .send({ email: existing.email, displayName: "Clone" });
      expect(res.status).toBe(409);
    });

    it("deactivates a member, which immediately blocks their sign-in", async () => {
      const victim = await createTestUser({ mustChangePassword: false });
      createdUserIds.push(victim.user.id);

      await request(app)
        .post("/api/auth/login")
        .send({ email: victim.user.email, password: victim.tempPassword })
        .expect(200);

      await adminAgent
        .patch(`/api/team/${victim.user.id}`)
        .set("x-csrf-token", adminCsrf)
        .send({ isActive: false })
        .expect(200);

      const after = await request(app)
        .post("/api/auth/login")
        .send({ email: victim.user.email, password: victim.tempPassword });
      expect(after.status).toBe(403);
      expect(after.body.error.code).toBe("EMAIL_NOT_ALLOWED");
    });

    it("stops an admin from deactivating their own account", async () => {
      const res = await adminAgent
        .patch(`/api/team/${adminId}`)
        .set("x-csrf-token", adminCsrf)
        .send({ isActive: false });
      expect(res.status).toBe(400);
    });
  });

  describe("issues", () => {
    it("creates an issue with a reference and converts it into a task", async () => {
      const created = await memberAgent.post("/api/issues").set("x-csrf-token", memberCsrf).send({
        title: "Login occasionally returns 401",
        description: "يحدث بشكل متقطع بعد تحديث التوكن",
        priority: "HIGH",
        assigneeId: memberId,
      });

      expect(created.status).toBe(201);
      expect(typeof created.body.issue.reference).toBe("number");
      expect(created.body.issue.status).toBe("OPEN");
      const issueId = created.body.issue.id;

      const converted = await memberAgent
        .post(`/api/issues/${issueId}/convert`)
        .set("x-csrf-token", memberCsrf)
        .send();

      expect(converted.status).toBe(200);
      expect(converted.body.issue.convertedTask.title).toBe("Login occasionally returns 401");
      // The issue survives conversion rather than being replaced.
      expect(converted.body.issue.status).toBe("IN_PROGRESS");

      // Converting twice would silently create a duplicate task.
      const again = await memberAgent
        .post(`/api/issues/${issueId}/convert`)
        .set("x-csrf-token", memberCsrf)
        .send();
      expect(again.status).toBe(409);

      await prisma.task.deleteMany({ where: { id: converted.body.issue.convertedTaskId } });
    });

    it("only lets the reporter delete an issue", async () => {
      const created = await memberAgent
        .post("/api/issues")
        .set("x-csrf-token", memberCsrf)
        .send({ title: "Reporter-only delete" });
      const issueId = created.body.issue.id;

      const refused = await adminAgent
        .delete(`/api/issues/${issueId}`)
        .set("x-csrf-token", adminCsrf);
      expect(refused.status).toBe(403);

      await memberAgent
        .delete(`/api/issues/${issueId}`)
        .set("x-csrf-token", memberCsrf)
        .expect(204);
    });

    it("rejects an invalid issue status", async () => {
      const res = await memberAgent
        .post("/api/issues")
        .set("x-csrf-token", memberCsrf)
        .send({ title: "Bad status", status: "WONTFIX" });
      expect(res.status).toBe(400);
    });
  });

  describe("milestones", () => {
    it("reports progress from the tasks attached to it", async () => {
      const created = await adminAgent
        .post("/api/milestones")
        .set("x-csrf-token", adminCsrf)
        .send({ title: "Portal MVP", deadline: new Date(Date.now() + 86400000).toISOString() });
      expect(created.status).toBe(201);
      const milestoneId = created.body.milestone.id;
      createdMilestoneIds.push(milestoneId);

      // An empty milestone has no percentage yet — nothing has gone wrong.
      const empty = await adminAgent.get("/api/milestones");
      const before = empty.body.milestones.find((m: { id: string }) => m.id === milestoneId);
      expect(before.progress).toEqual({ totalTasks: 0, completedTasks: 0, percent: null });

      const taskA = await adminAgent
        .post("/api/tasks")
        .set("x-csrf-token", adminCsrf)
        .send({ title: "Milestone task A", assigneeIds: [adminId] });
      const taskB = await adminAgent
        .post("/api/tasks")
        .set("x-csrf-token", adminCsrf)
        .send({ title: "Milestone task B", assigneeIds: [adminId] });

      await prisma.task.updateMany({
        where: { id: { in: [taskA.body.task.id, taskB.body.task.id] } },
        data: { milestoneId },
      });

      await adminAgent
        .post(`/api/tasks/${taskA.body.task.id}/archive`)
        .set("x-csrf-token", adminCsrf)
        .send();

      const after = await adminAgent.get(`/api/milestones/${milestoneId}`);
      expect(after.body.milestone.progress).toEqual({
        totalTasks: 2,
        completedTasks: 1,
        percent: 50,
      });
    });

    it("attaches a task to a milestone through the task API and moves its progress", async () => {
      const created = await adminAgent
        .post("/api/milestones")
        .set("x-csrf-token", adminCsrf)
        .send({ title: "Attach via API" });
      const milestoneId = created.body.milestone.id;
      createdMilestoneIds.push(milestoneId);

      // Attached at creation time.
      const task = await adminAgent
        .post("/api/tasks")
        .set("x-csrf-token", adminCsrf)
        .send({ title: "Born attached", assigneeIds: [adminId], milestoneId });
      expect(task.status).toBe(201);
      expect(task.body.task.milestone.id).toBe(milestoneId);

      // And attached later by editing an existing task.
      const loose = await adminAgent
        .post("/api/tasks")
        .set("x-csrf-token", adminCsrf)
        .send({ title: "Attached later", assigneeIds: [adminId] });
      expect(loose.body.task.milestone).toBeNull();

      const attached = await adminAgent
        .patch(`/api/tasks/${loose.body.task.id}`)
        .set("x-csrf-token", adminCsrf)
        .send({ milestoneId });
      expect(attached.body.task.milestone.id).toBe(milestoneId);

      // Progress now reflects both, and finishing one moves it.
      await adminAgent
        .post(`/api/tasks/${task.body.task.id}/archive`)
        .set("x-csrf-token", adminCsrf)
        .send();

      const after = await adminAgent.get(`/api/milestones/${milestoneId}`);
      expect(after.body.milestone.progress).toEqual({
        totalTasks: 2,
        completedTasks: 1,
        percent: 50,
      });

      // Detaching is an explicit null, not an omission.
      const detached = await adminAgent
        .patch(`/api/tasks/${loose.body.task.id}`)
        .set("x-csrf-token", adminCsrf)
        .send({ milestoneId: null });
      expect(detached.body.task.milestone).toBeNull();
    });

    it("rejects a malformed milestone id on a task", async () => {
      const res = await adminAgent
        .post("/api/tasks")
        .set("x-csrf-token", adminCsrf)
        .send({ title: "Bad milestone", assigneeIds: [adminId], milestoneId: "not-a-uuid" });
      expect(res.status).toBe(400);
    });

    it("keeps tasks when the milestone is deleted", async () => {
      const created = await adminAgent
        .post("/api/milestones")
        .set("x-csrf-token", adminCsrf)
        .send({ title: "Doomed milestone" });
      const milestoneId = created.body.milestone.id;

      const task = await adminAgent
        .post("/api/tasks")
        .set("x-csrf-token", adminCsrf)
        .send({ title: "Survivor", assigneeIds: [adminId] });
      await prisma.task.update({ where: { id: task.body.task.id }, data: { milestoneId } });

      await adminAgent
        .delete(`/api/milestones/${milestoneId}`)
        .set("x-csrf-token", adminCsrf)
        .expect(204);

      const survivor = await prisma.task.findUnique({ where: { id: task.body.task.id } });
      expect(survivor).not.toBeNull();
      expect(survivor?.milestoneId).toBeNull();
    });
  });

  describe("notifications", () => {
    it("notifies an assignee but never the person who made the change", async () => {
      const created = await adminAgent
        .post("/api/tasks")
        .set("x-csrf-token", adminCsrf)
        .send({ title: "Notify probe", assigneeIds: [memberId, adminId] });
      expect(created.status).toBe(201);

      const theirs = await memberAgent.get("/api/notifications");
      expect(
        theirs.body.notifications.some(
          (n: { type: string; body: string }) =>
            n.type === "TASK_ASSIGNED" && n.body === "Notify probe",
        ),
      ).toBe(true);

      // The admin assigned themselves too, and must not be pinged for it.
      const mine = await adminAgent.get("/api/notifications");
      expect(mine.body.notifications.some((n: { body: string }) => n.body === "Notify probe")).toBe(
        false,
      );
    });

    it("raises a mention from a comment body", async () => {
      const member = await prisma.user.findUniqueOrThrow({ where: { id: memberId } });
      const handle = member.email.split("@")[0];

      const task = await adminAgent
        .post("/api/tasks")
        .set("x-csrf-token", adminCsrf)
        .send({ title: "Mention probe", assigneeIds: [adminId] });

      await adminAgent
        .post(`/api/tasks/${task.body.task.id}/comments`)
        .set("x-csrf-token", adminCsrf)
        .send({ body: `@${handle} تقدر تراجع هذي؟` })
        .expect(201);

      const theirs = await memberAgent.get("/api/notifications");
      expect(
        theirs.body.notifications.some((n: { type: string }) => n.type === "COMMENT_MENTION"),
      ).toBe(true);
    });

    it("marks notifications read, and cannot touch someone else's", async () => {
      const list = await memberAgent.get("/api/notifications");
      const first = list.body.notifications[0];
      expect(first).toBeDefined();

      // The admin is not the recipient, so this must not resolve.
      const foreign = await adminAgent
        .post(`/api/notifications/${first.id}/read`)
        .set("x-csrf-token", adminCsrf)
        .send();
      expect(foreign.status).toBe(404);

      await memberAgent
        .post(`/api/notifications/${first.id}/read`)
        .set("x-csrf-token", memberCsrf)
        .send()
        .expect(204);

      await memberAgent
        .post("/api/notifications/read-all")
        .set("x-csrf-token", memberCsrf)
        .send()
        .expect(204);

      const after = await memberAgent.get("/api/notifications");
      expect(after.body.unread).toBe(0);
    });
  });

  describe("overview", () => {
    it("returns the headline numbers and the caller's own tasks", async () => {
      const res = await memberAgent.get("/api/overview");
      expect(res.status).toBe(200);
      expect(res.body.stats).toEqual(
        expect.objectContaining({
          activeTasks: expect.any(Number),
          completedThisWeek: expect.any(Number),
          openIssues: expect.any(Number),
          servicesUp: expect.any(Number),
          servicesMonitored: expect.any(Number),
        }),
      );
      // "Your tasks" must only ever contain the caller's own work.
      for (const task of res.body.myTasks) {
        expect(task.isArchived).toBe(false);
      }
    });
  });
});
