import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  APP_URL: z.string().url("APP_URL must be a valid URL"),
  FRONTEND_URL: z.string().url("FRONTEND_URL must be a valid URL"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters long"),
  // Login throttling. Defaults are the production-safe values; raise the max only
  // for automated test runs, never on the real server.
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  LOGIN_RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().positive().default(15),
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

  // Cookie scope. Leave unset for host-only cookies (required in development —
  // a browser rejects a ".kstacks.org" cookie served from localhost). Set to
  // ".kstacks.org" in production to share the session across KStack subdomains.
  SESSION_COOKIE_DOMAIN: z.string().trim().min(1).optional(),

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
