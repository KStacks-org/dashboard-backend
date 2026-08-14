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
