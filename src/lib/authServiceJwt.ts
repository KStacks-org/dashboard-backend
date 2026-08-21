import { createRemoteJWKSet, type JWTVerifyGetKey, jwtVerify } from "jose";
import { env } from "@/config/env.js";
import { UnauthorizedError } from "@/errors/AppError.js";

/**
 * Verifies tokens minted by auth-service, the KStacks-wide identity service
 * the dashboard's own login is migrating onto. Signature verification only
 * needs the public half of its signing key, fetched from its published JWKS
 * endpoint and cached/rotated automatically by `jose` — no shared secret
 * with that service, and nothing here can mint a token, only check one.
 */
let authServiceJwks: JWTVerifyGetKey = createRemoteJWKSet(new URL(env.AUTH_SERVICE_JWKS_URL));

/**
 * Test-only seam: swaps in a locally-signed key set so tests can verify
 * self-issued tokens without a network call to the real auth-service JWKS.
 * Never called outside test setup.
 */
export function __setAuthServiceJwksForTests(jwks: JWTVerifyGetKey) {
  authServiceJwks = jwks;
}

export type AuthServiceUser = {
  id: string;
  name: string;
  email: string;
  /**
   * Empty until auth-service's flags system ships. No claim means no
   * authority — never treat a missing claim as "trust by default".
   */
  flags: string[];
};

/**
 * Throws UnauthorizedError on any failure — expired, wrong signature, wrong
 * issuer, or missing claims — rather than surfacing which, so a caller can't
 * learn anything about *why* a token was rejected.
 */
export async function verifyAuthServiceToken(token: string): Promise<AuthServiceUser> {
  try {
    const { payload } = await jwtVerify(token, authServiceJwks, {
      issuer: env.AUTH_SERVICE_JWT_ISSUER,
    });

    const { sub: id, name, email, flags } = payload;
    if (typeof id !== "string" || typeof name !== "string" || typeof email !== "string") {
      throw new UnauthorizedError("Token is missing required claims");
    }

    return {
      id,
      name,
      email,
      flags: Array.isArray(flags)
        ? flags.filter((flag): flag is string => typeof flag === "string")
        : [],
    };
  } catch (err) {
    if (err instanceof UnauthorizedError) throw err;
    throw new UnauthorizedError("Invalid or expired token");
  }
}

/** `"super-admin"` is auth-service's own constant (`Flag.SUPER_ADMIN`) — kept as one literal here rather than duplicated at each call site. */
export function isSuperAdmin(user: AuthServiceUser): boolean {
  return user.flags.includes("super-admin");
}
