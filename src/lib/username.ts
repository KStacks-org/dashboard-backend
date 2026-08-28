import type { Prisma } from "@prisma/client";

/**
 * A readable, collision-free internal key derived from an address.
 *
 * `username` is how the seed matches a row it has already written, so it has
 * to be stable and unique, but nothing outside the seed reads it and the API
 * never exposes it — hence "derived from the email" rather than anything the
 * person chooses.
 *
 * Takes the client rather than importing it so a caller inside a transaction
 * checks uniqueness against the same transaction it will insert in.
 */
export async function deriveUsername(db: Prisma.TransactionClient, email: string): Promise<string> {
  const base = email.split("@")[0]?.replace(/[^a-z0-9._-]/gi, "") || "member";
  let username = base.slice(0, 40);
  let attempt = 1;
  while (await db.user.findUnique({ where: { username }, select: { id: true } })) {
    username = `${base.slice(0, 36)}.${++attempt}`;
  }
  return username;
}
