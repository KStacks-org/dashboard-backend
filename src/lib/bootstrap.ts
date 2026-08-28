import type { User } from "@prisma/client";
import { env } from "@/config/env.js";
import type { AuthServiceUser } from "@/lib/authServiceJwt.js";
import { logger } from "@/lib/logger.js";
import { prisma } from "@/lib/prisma.js";
import { deriveUsername } from "@/lib/username.js";
import { isAllowedEmailDomain } from "@/validation/auth.schema.js";

/**
 * Serialises concurrent claims. Two people signing in at the same instant would
 * otherwise both read "no super admin" and both be promoted; the lock makes the
 * second one read the first one's result instead. Transaction-scoped, so it is
 * released whether the transaction commits or rolls back.
 */
const CLAIM_LOCK_KEY = 8_246_119_004n;

/**
 * Set once we have seen an owned dashboard, so the common case — every request
 * for the rest of the process's life — costs nothing. Only ever flipped on:
 * a dashboard that has an owner does not go back to having none (removing the
 * last super admin is refused; see team.service.updateMember).
 */
let dashboardIsOwned = false;

/** Test-only seam: forgets the memo so a suite can exercise an unowned dashboard. */
export function __resetBootstrapMemoForTests() {
  dashboardIsOwned = false;
}

/**
 * A freshly deployed dashboard has no super admin, and only a super admin can
 * appoint one — a closed loop that used to be broken by hand, with an INSERT
 * against the production database. This is that step, done by the app: while
 * nobody owns the dashboard, the first eligible person to sign in claims it.
 *
 * "Eligible" is deliberately narrow, because the claim hands out the highest
 * authority this app has:
 *   - auth-service must already vouch for the identity (the caller has verified
 *     their token before we ever get here);
 *   - the address must sit on an allowed university domain;
 *   - if BOOTSTRAP_ADMIN_EMAIL is set, it must be that exact address;
 *   - and a deactivated roster row is never revived by it — switching someone
 *     off is a decision, not an absence of one.
 *
 * It can only ever happen once: the claim itself is what makes the dashboard
 * owned, and every later attempt sees a super admin and declines. From then on
 * authority spreads the normal way — the super admin grants scopes on the Team
 * page.
 *
 * Returns the newly minted super admin, or null if the dashboard already has an
 * owner or this identity is not eligible to become one — in which case the
 * caller carries on treating them exactly as it did before.
 */
export async function claimUnownedDashboard(identity: AuthServiceUser): Promise<User | null> {
  if (dashboardIsOwned) return null;

  const email = identity.email.toLowerCase();
  if (email.length > 200 || !isAllowedEmailDomain(email)) return null;
  if (env.BOOTSTRAP_ADMIN_EMAIL && env.BOOTSTRAP_ADMIN_EMAIL !== email) return null;

  const claimed = await prisma
    .$transaction(async (tx) => {
      // The lock returns void, which Prisma cannot deserialize as a column —
      // hence selecting a constant and leaving the call in the FROM clause.
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(${CLAIM_LOCK_KEY}::bigint)`;

      const owners = await tx.user.count({ where: { role: "SUPER_ADMIN", isActive: true } });
      if (owners > 0) {
        dashboardIsOwned = true;
        return null;
      }

      const existing = await tx.user.findUnique({ where: { email } });
      // A row that was switched off stays off, even with nobody holding the keys.
      if (existing && !existing.isActive) return null;

      // Someone already on the roster is promoted in place rather than
      // duplicated — a seeded placeholder and the person signing in are the
      // same account.
      if (existing) {
        return tx.user.update({ where: { id: existing.id }, data: { role: "SUPER_ADMIN" } });
      }

      return tx.user.create({
        data: {
          email,
          username: await deriveUsername(tx, email),
          // The column stops at 100 characters; a blank name from auth-service
          // leaves the address as the only thing to show them by.
          displayName: (identity.name.trim() || email).slice(0, 100),
          role: "SUPER_ADMIN",
        },
      });
    })
    // Signing in must not depend on this working. It runs on the way through
    // attachUser for anyone who is not already a super admin, so a failure here
    // — a lost connection, a losing race — has to leave the caller exactly where
    // it would have been without the bootstrap, not lock everyone out.
    .catch((error: unknown) => {
      logger.error({ err: error }, "Super admin bootstrap check failed; continuing without it");
      return null;
    });

  if (claimed) {
    dashboardIsOwned = true;
    // Worth a warning rather than an info line: it is the single moment the
    // dashboard acquires an owner, and it should be obvious in the logs which
    // address that was — including if it turns out to be the wrong one.
    logger.warn(
      { userId: claimed.id, email: claimed.email },
      "Dashboard had no super admin — first sign-in claimed it",
    );
  }

  return claimed;
}
