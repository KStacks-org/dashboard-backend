import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma.js";
import { app, cleanupUser, createTestUser } from "./helpers.js";
import { extractCookie } from "./testUtils.js";

describe("support conversations", () => {
  const createdUserIds: string[] = [];
  const createdConversationIds: string[] = [];
  let staffAgent: ReturnType<typeof request.agent>;
  let staffCsrf: string;

  const openConversation = async (overrides: Partial<Record<string, string>> = {}) => {
    const res = await request(app)
      .post("/api/public/support/conversations")
      .send({
        serviceCodename: "kindex",
        pageContext: "/dev — the filters section",
        reporterName: "طالب مبلغ",
        reporterEmail: "reporter@example.com",
        body: "الصفحة ما تفتح عندي",
        ...overrides,
      });
    if (res.status === 201) createdConversationIds.push(res.body.conversation.id);
    return res;
  };

  beforeAll(async () => {
    const staff = await createTestUser({ mustChangePassword: false });
    createdUserIds.push(staff.user.id);
    staffAgent = request.agent(app);
    const login = await staffAgent
      .post("/api/auth/login")
      .send({ email: staff.user.email, password: staff.tempPassword });
    staffCsrf = extractCookie(login, "kstacks.csrf");
  });

  afterAll(async () => {
    await prisma.supportMessage.deleteMany({
      where: { conversationId: { in: createdConversationIds } },
    });
    await prisma.supportConversation.deleteMany({
      where: { id: { in: createdConversationIds } },
    });
    await Promise.all(createdUserIds.map((id) => cleanupUser(id)));
    await prisma.$disconnect();
  });

  it("opens a conversation from the public widget with no session", async () => {
    const res = await openConversation();
    expect(res.status).toBe(201);
    expect(res.body.conversation.token).toBeTruthy();
    expect(res.body.conversation.status).toBe("OPEN");
    expect(res.body.conversation.serviceCodename).toBe("kindex");
    expect(res.body.conversation.messages).toHaveLength(1);
    expect(res.body.conversation.messages[0].senderType).toBe("REPORTER");
  });

  it("rejects a report missing required fields", async () => {
    const res = await openConversation({ reporterEmail: "not-an-email" });
    expect(res.status).toBe(400);
  });

  it("silently rejects a honeypot-filled submission as spam", async () => {
    const res = await openConversation({ website: "http://spam.example" });
    expect(res.status).toBe(400);
  });

  it("lets the reporter fetch and add to their own thread by token", async () => {
    const opened = await openConversation();
    const token = opened.body.conversation.token;

    const fetched = await request(app).get(`/api/public/support/conversations/${token}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.conversation.messages).toHaveLength(1);

    const followUp = await request(app)
      .post(`/api/public/support/conversations/${token}/messages`)
      .send({ body: "تفاصيل إضافية" });
    expect(followUp.status).toBe(201);
    expect(followUp.body.conversation.messages).toHaveLength(2);
  });

  it("404s a made-up token instead of leaking whether it ever existed", async () => {
    const res = await request(app).get(
      "/api/public/support/conversations/00000000-0000-0000-0000-000000000000",
    );
    expect(res.status).toBe(404);
  });

  it("blocks the staff inbox from an unauthenticated caller", async () => {
    const res = await request(app).get("/api/support");
    expect(res.status).toBe(401);
  });

  it("lets staff see, reply to, and close a reported conversation", async () => {
    const opened = await openConversation();
    const id = opened.body.conversation.id;

    const listed = await staffAgent.get("/api/support?status=OPEN");
    expect(listed.status).toBe(200);
    expect(listed.body.conversations.some((c: { id: string }) => c.id === id)).toBe(true);

    const personalReply = await staffAgent
      .post(`/api/support/${id}/reply`)
      .set("x-csrf-token", staffCsrf)
      .send({ body: "شكراً على البلاغ، نشتغل عليها", asOrg: false });
    expect(personalReply.status).toBe(201);
    const lastMessage = personalReply.body.conversation.messages.at(-1);
    expect(lastMessage.senderType).toBe("STAFF");
    expect(lastMessage.asOrg).toBe(false);
    expect(lastMessage.staff).not.toBeNull();

    const orgReply = await staffAgent
      .post(`/api/support/${id}/reply`)
      .set("x-csrf-token", staffCsrf)
      .send({ body: "تم الحل رسمياً من فريق KStack", asOrg: true });
    expect(orgReply.body.conversation.messages.at(-1).asOrg).toBe(true);

    const closed = await staffAgent
      .patch(`/api/support/${id}/status`)
      .set("x-csrf-token", staffCsrf)
      .send({ status: "CLOSED" });
    expect(closed.status).toBe(200);
    expect(closed.body.conversation.status).toBe("CLOSED");
    expect(closed.body.conversation.closedBy.id).toBeTruthy();

    // Closing twice is rejected rather than silently accepted.
    const closedAgain = await staffAgent
      .patch(`/api/support/${id}/status`)
      .set("x-csrf-token", staffCsrf)
      .send({ status: "CLOSED" });
    expect(closedAgain.status).toBe(400);
  });

  it("refuses a reporter message on a closed conversation instead of reopening it", async () => {
    const opened = await openConversation();
    const { id, token } = opened.body.conversation;

    await staffAgent
      .patch(`/api/support/${id}/status`)
      .set("x-csrf-token", staffCsrf)
      .send({ status: "CLOSED" })
      .expect(200);

    const reply = await request(app)
      .post(`/api/public/support/conversations/${token}/messages`)
      .send({ body: "ما زالت المشكلة موجودة" });
    expect(reply.status).toBe(409);

    // Staff can still reopen it themselves — only the reporter's own message can't.
    const reopened = await staffAgent
      .patch(`/api/support/${id}/status`)
      .set("x-csrf-token", staffCsrf)
      .send({ status: "OPEN" });
    expect(reopened.status).toBe(200);
  });
});
