import pino from "pino";
import { env, isProduction } from "@/config/env.js";

export const logger = pino({
  level: env.NODE_ENV === "test" ? "silent" : isProduction ? "info" : "debug",
  transport: isProduction
    ? undefined
    : { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } },
  redact: {
    paths: [
      "req.headers.cookie",
      "req.headers.authorization",
      "*.password",
      "*.passwordHash",
      "*.currentPassword",
      "*.newPassword",
    ],
    censor: "[redacted]",
  },
});
