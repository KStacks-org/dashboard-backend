import rateLimit from "express-rate-limit";
import { env } from "@/config/env.js";

export const loginRateLimiter = rateLimit({
  windowMs: env.LOGIN_RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
  limit: env.LOGIN_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: { code: "TOO_MANY_ATTEMPTS", message: "Too many login attempts. Try again later." },
  },
});

export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "TOO_MANY_REQUESTS", message: "Too many requests. Slow down." } },
});
