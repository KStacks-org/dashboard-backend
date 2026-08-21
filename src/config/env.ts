import "dotenv/config";
import { z } from "zod";

const envSchema = z
  .object({
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    PORT: z.coerce.number().int().positive().default(4100),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    APP_URL: z.string().url("APP_URL must be a valid URL"),
    FRONTEND_URL: z.string().url("FRONTEND_URL must be a valid URL"),
    // Throttling for the public "report a problem" endpoints — same override
    // rule as the login limits above: raised only for automated test runs.
    SUPPORT_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
    SUPPORT_CREATE_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5),
    // Background probing of service health URLs.
    HEALTH_CHECK_ENABLED: z
      .enum(["true", "false"])
      .default("true")
      .transform((v) => v === "true"),
    HEALTH_CHECK_INTERVAL_MINUTES: z.coerce.number().int().positive().max(1440).default(5),

    // Background refresh of the public service catalogue from the KStacks site.
    // A service added there appears here on the next run, with no manual step.
    SERVICE_SYNC_ENABLED: z
      .enum(["true", "false"])
      .default("true")
      .transform((v) => v === "true"),
    SERVICE_SYNC_INTERVAL_HOURS: z.coerce.number().int().positive().max(168).default(24),
    SERVICE_CATALOG_URL: z
      .string()
      .url("SERVICE_CATALOG_URL must be a valid URL")
      .default("https://kstacks.org/"),

    // Cookie scope for the CSRF cookie, and for clearing auth-service's
    // access_token/refresh_token cookies on logout. Leave unset for host-only
    // cookies (required in development — a browser rejects a ".kstacks.org"
    // cookie served from localhost). Set to ".kstacks.org" in production —
    // the same domain auth-service itself uses — so these line up with the
    // identity cookies it sets.
    COOKIE_DOMAIN: z.string().trim().min(1).optional(),

    // Origins allowed to call the public "report a problem" endpoints — the
    // KStack service sites the embeddable widget runs on. Separate from
    // FRONTEND_URL above, which is this dashboard's own origin and covers
    // only the session-authenticated API. Comma-separated; empty means no
    // outside site can reach the widget endpoints yet.
    SUPPORT_WIDGET_ORIGINS: z
      .string()
      .trim()
      .default("")
      .transform((value) =>
        value
          .split(",")
          .map((origin) => origin.trim())
          .filter(Boolean),
      ),

    // Only addresses on these domains may sign in. Comma-separated.
    ALLOWED_EMAIL_DOMAINS: z
      .string()
      .trim()
      .default("stu.kau.edu.sa")
      .transform((value) =>
        value
          .split(",")
          .map((domain) => domain.trim().toLowerCase().replace(/^@/, ""))
          .filter(Boolean),
      )
      .refine((domains) => domains.length > 0, "At least one allowed email domain is required"),

    // GitHub activity feed. Works unauthenticated at 60 requests/hour, which one
    // refresh nearly exhausts — a read-only token raises it to 5000.
    GITHUB_ORG: z.string().trim().min(1).default("KStacks-org"),
    GITHUB_TOKEN: z.string().trim().min(1).optional(),
    GITHUB_CACHE_MINUTES: z.coerce.number().int().positive().max(1440).default(20),

    // Signing key for the tokens other KStack services read. RSA private key in
    // PKCS8 PEM, either literal or base64-encoded (a PEM spans lines, which .env
    // handles badly). Only the public half is ever published, at
    // /.well-known/jwks.json. Optional in development — a throwaway key is
    // generated at boot — but required in production, enforced below.
    JWT_PRIVATE_KEY: z.string().trim().min(1).optional(),
    JWT_ISSUER: z.string().trim().min(1).default("https://kstacks.org"),
    JWT_AUDIENCE: z.string().trim().min(1).default("kstacks-services"),
    // Short-lived by design: the token carries authority, and revoking a scope
    // should take effect quickly. Consumers re-fetch rather than cache it long.
    JWT_TTL_MINUTES: z.coerce.number().int().positive().max(1440).default(15),

    // The KStacks-wide identity service the dashboard's own login is
    // migrating onto. Only used to verify tokens it issues — the dashboard
    // never holds its signing key, only the public half at this JWKS URL.
    // Both default to the real production values, so nothing to set until a
    // local/staging auth-service is stood up separately.
    AUTH_SERVICE_JWKS_URL: z
      .string()
      .url("AUTH_SERVICE_JWKS_URL must be a valid URL")
      .default("https://api.kstacks.org/auth/.well-known/jwks.json"),
    AUTH_SERVICE_JWT_ISSUER: z.string().trim().min(1).default("kstack"),
  })
  .refine((config) => config.NODE_ENV !== "production" || Boolean(config.JWT_PRIVATE_KEY), {
    path: ["JWT_PRIVATE_KEY"],
    message:
      "JWT_PRIVATE_KEY is required in production — without it every restart invalidates all service tokens",
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Fail loudly and refuse to boot rather than run with an incomplete/insecure config.
  console.error("Invalid or missing environment variables:");
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === "production";
