import type { Response } from "supertest";

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
