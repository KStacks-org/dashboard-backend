import type { Response } from "supertest";

/**
 * The stand-in super admin every suite runs behind — see tests/setup.ts, which
 * creates it, and tests/globalTeardown.ts, which removes it again. Kept here
 * rather than in either of those because globalTeardown runs outside a test
 * context, where importing a module that calls `beforeAll` at import time
 * throws.
 */
export const TEST_OWNER_USERNAME = "test.dashboard.owner";

/** Pulls a cookie's raw value out of a supertest response's Set-Cookie headers. */
export function extractCookie(res: Response, name: string): string {
  const setCookie = res.headers["set-cookie"];
  const cookies: string[] = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const found = cookies.find((c) => c.startsWith(`${name}=`));
  if (!found) throw new Error(`Cookie ${name} not found in response`);

  const pair = found.split(";", 1)[0] ?? "";
  const value = pair.slice(name.length + 1);
  return decodeURIComponent(value);
}
