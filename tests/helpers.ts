import { randomUUID } from "node:crypto";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import request from "supertest";
import { createApp } from "@/app.js";
import { env } from "@/config/env.js";
import { __setAuthServiceJwksForTests } from "@/lib/authServiceJwt.js";
import { prisma } from "@/lib/prisma.js";
import { extractCookie } from "./testUtils.js";

export const app = createApp();

const TEST_KEY_ALG = "ES256";
const testKeysReady = (async () => {
  const { privateKey, publicKey } = await generateKeyPair(TEST_KEY_ALG, { extractable: true });
  const publicJwk = {
    ...(await exportJWK(publicKey)),
    kid: "test-key",
    alg: TEST_KEY_ALG,
    use: "sig",
  };
  __setAuthServiceJwksForTests(createLocalJWKSet({ keys: [publicJwk] }));
  return privateKey;
})();

/**
 * Signs a token shaped like the ones auth-service issues, using a throwaway
 * key pair generated for this test run and wired into authServiceJwt.ts in
 * place of the real network JWKS — no call to auth-service happens in tests.
 */
export async function signTestAccessToken(user: {
  id: string;
  email: string;
  displayName: string;
  flags?: string[];
}) {
  const privateKey = await testKeysReady;
  return new SignJWT({ name: user.displayName, email: user.email, flags: user.flags ?? [] })
    .setProtectedHeader({ alg: TEST_KEY_ALG, kid: "test-key" })
    .setSubject(user.id)
    .setIssuer(env.AUTH_SERVICE_JWT_ISSUER)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
}

/** Creates an isolated, throwaway user for a single test run (never touches real seed data). */
export async function createTestUser(overrides?: { isActive?: boolean }) {
  const suffix = randomUUID().slice(0, 8);
  const user = await prisma.user.create({
    data: {
      username: `test.user.${suffix}`,
      // On the allowed domain so these fixtures pass the roster/domain checks.
      email: `test.user.${suffix}@stu.kau.edu.sa`,
      displayName: `Test User ${suffix}`,
      isActive: overrides?.isActive ?? true,
    },
  });
  return user;
}

/**
 * A supertest agent pre-authenticated as `user`, with its CSRF cookie already
 * captured — the same shape tests got from a real login before auth-service.
 * The access_token cookie is set directly on the agent's jar rather than via
 * a response, since nothing in this app issues that cookie anymore.
 */
export async function signInTestUser(
  user: { id: string; email: string; displayName: string },
  flags: string[] = [],
) {
  const token = await signTestAccessToken({ ...user, flags });
  const agent = request.agent(app);
  // supertest doesn't type the underlying superagent cookie jar, but it's
  // there at runtime — this is the one place tests need to reach into it.
  // biome-ignore lint/suspicious/noExplicitAny: superagent's jar isn't in supertest's types
  (agent as any).jar.setCookie(`access_token=${token}; Path=/`);

  // Round-trips through a real request so attachUser issues the CSRF cookie
  // exactly as it would for a real browser's first authenticated request.
  const res = await agent.get("/api/auth/me").expect(200);
  const csrf = extractCookie(res, "kstacks.csrf");
  return { agent, csrf, id: user.id };
}

export async function createTestService() {
  const suffix = randomUUID().slice(0, 8);
  return prisma.service.create({
    data: {
      name: `Test Service ${suffix}`,
      codename: `test-svc-${suffix}`,
      tagline: "Test tagline",
      description: "Test description",
      status: "LIVE",
      url: "https://example.test",
      sortOrder: 999,
    },
  });
}

export async function cleanupUser(userId: string) {
  await prisma.task.deleteMany({ where: { createdById: userId } });
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
}

export async function cleanupService(serviceId: string) {
  await prisma.service.delete({ where: { id: serviceId } }).catch(() => {});
}
