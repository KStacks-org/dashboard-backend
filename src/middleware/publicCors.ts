import cors from "cors";
import { env } from "@/config/env.js";

/**
 * CORS for the public "report a problem" endpoints, kept entirely separate
 * from the dashboard's own `cors({ origin: env.FRONTEND_URL })` in app.ts.
 *
 * That policy exists to protect a session cookie and can only name one
 * origin. This one has the opposite shape: many origins (the KStack service
 * sites the widget is embedded on), no cookie at all — a reporter has no
 * account here, so nothing about identifying them relies on credentials.
 * Opening this one up wide would be harmless on its own, but living on the
 * same `cors()` call as the session-backed API would have widened *that*
 * instead, which is what this stays a separate middleware to avoid.
 */
export const publicSupportCors = cors({
  origin(origin, callback) {
    // No Origin header at all (curl, server-to-server) — nothing to check against.
    if (!origin || env.SUPPORT_WIDGET_ORIGINS.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error("Not allowed by CORS"));
  },
  credentials: false,
  methods: ["GET", "POST"],
});
