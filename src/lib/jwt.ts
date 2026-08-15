import { createHash, randomUUID } from "node:crypto";
import { type CryptoKey, exportJWK, generateKeyPair, importPKCS8, SignJWT } from "jose";
import { env } from "@/config/env.js";
import type { Grants } from "@/lib/authz.js";
import { logger } from "@/lib/logger.js";

/**
 * Mints the token other KStack services read to learn who someone is and what
 * they administer.
 *
 * Signed with RS256 rather than a shared secret on purpose: the dashboard holds
 * the private key alone and publishes only the public half at
 * /.well-known/jwks.json, so a service can verify a token but cannot forge one.
 * A symmetric secret would have to be handed to every service, and any of them
 * could then mint an admin token for anyone.
 */
const ALGORITHM = "RS256";

type KeyMaterial = { privateKey: CryptoKey; publicJwk: Record<string, unknown>; kid: string };

let keyPromise: Promise<KeyMaterial> | null = null;

/**
 * A PEM in a .env file is awkward — it spans lines — so the value may also be
 * base64-encoded. Both are accepted; the shape tells them apart.
 */
function decodePrivateKey(value: string): string {
  const trimmed = value.trim();
  if (trimmed.includes("BEGIN")) return trimmed.replace(/\\n/g, "\n");
  return Buffer.from(trimmed, "base64").toString("utf8");
}

/** A stable key id derived from the public key, so rotating the key rotates the kid. */
function deriveKid(jwk: Record<string, unknown>): string {
  const canonical = JSON.stringify({ e: jwk.e, kty: jwk.kty, n: jwk.n });
  return createHash("sha256").update(canonical).digest("base64url").slice(0, 16);
}

async function loadKeys(): Promise<KeyMaterial> {
  if (env.JWT_PRIVATE_KEY) {
    const privateKey = await importPKCS8(decodePrivateKey(env.JWT_PRIVATE_KEY), ALGORITHM, {
      extractable: true,
    });
    const publicJwk = await publicJwkFrom(privateKey);
    return { privateKey, publicJwk, kid: deriveKid(publicJwk) };
  }

  // Development only — env.ts refuses to boot production without a real key.
  // Ephemeral by design: restarting invalidates every token it signed, which is
  // the correct behaviour for a key nobody configured.
  const { privateKey, publicKey } = await generateKeyPair(ALGORITHM, { extractable: true });
  const publicJwk = (await exportJWK(publicKey)) as Record<string, unknown>;
  logger.warn(
    "JWT_PRIVATE_KEY is not set — signing service tokens with a throwaway key that changes on every restart",
  );
  return { privateKey, publicJwk, kid: deriveKid(publicJwk) };
}

/** Derives the public JWK from the private key so only one secret is configured. */
async function publicJwkFrom(privateKey: CryptoKey): Promise<Record<string, unknown>> {
  const jwk = (await exportJWK(privateKey)) as Record<string, unknown>;
  // Strip every private component; what remains is safe to publish.
  const { d: _d, p: _p, q: _q, dp: _dp, dq: _dq, qi: _qi, ...pub } = jwk;
  return pub;
}

function keys(): Promise<KeyMaterial> {
  keyPromise ??= loadKeys();
  return keyPromise;
}

export type ServiceTokenSubject = {
  id: string;
  email: string;
  displayName: string;
};

/**
 * A token describing one person's authority across the KStack estate.
 *
 * `super_admin` is a wildcard: it is emitted alongside `scopes` rather than by
 * expanding it into every scope name, because the set of services changes. A
 * consumer that reads only `scopes` therefore under-grants a super admin, which
 * fails closed rather than open.
 */
export async function issueServiceToken(user: ServiceTokenSubject, grants: Grants) {
  const { privateKey, kid } = await keys();
  const expiresIn = `${env.JWT_TTL_MINUTES}m`;

  const token = await new SignJWT({
    email: user.email,
    name: user.displayName,
    super_admin: grants.isSuperAdmin,
    scopes: grants.scopes,
  })
    .setProtectedHeader({ alg: ALGORITHM, kid, typ: "JWT" })
    .setSubject(user.id)
    .setIssuer(env.JWT_ISSUER)
    .setAudience(env.JWT_AUDIENCE)
    .setIssuedAt()
    .setJti(randomUUID())
    .setExpirationTime(expiresIn)
    .sign(privateKey);

  return { token, expiresInSeconds: env.JWT_TTL_MINUTES * 60 };
}

/** The public half, in the shape every JWT library expects to fetch. */
export async function publicJwks() {
  const { publicJwk, kid } = await keys();
  return { keys: [{ ...publicJwk, kid, alg: ALGORITHM, use: "sig" }] };
}
