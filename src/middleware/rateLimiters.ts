import rateLimit from "express-rate-limit";
import { env } from "@/config/env.js";

export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "TOO_MANY_REQUESTS", message: "Too many requests. Slow down." } },
});

/**
 * The public support endpoints have no session to rate-limit by user, and no
 * login wall to slow down an attacker — an IP is the only handle available.
 * Applied to every request on that router; opening a new conversation is
 * throttled harder still, by supportCreateRateLimiter below.
 */
export const supportRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.SUPPORT_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "TOO_MANY_REQUESTS", message: "Too many requests. Slow down." } },
});

/** Opening a new thread is the expensive, spam-worthy action; replying to one you already hold a token for is cheaper to allow more of. */
export const supportCreateRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: env.SUPPORT_CREATE_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: "TOO_MANY_REQUESTS",
      message: "Too many reports from this network. Try again later.",
    },
  },
});
