import { Router } from "express";
import * as authController from "@/controllers/auth.controller.js";
import { requireAuth } from "@/middleware/auth.js";
import { verifyCsrf } from "@/middleware/csrf.js";
import { loginRateLimiter } from "@/middleware/rateLimiters.js";

export const authRouter = Router();

authRouter.post("/login", loginRateLimiter, authController.login);
authRouter.post("/logout", requireAuth, verifyCsrf, authController.logout);
authRouter.get("/me", requireAuth, authController.me);
// The token other KStack services read. A GET with no body: it grants nothing
// new, it only states what the session already established.
authRouter.get("/token", requireAuth, authController.serviceToken);
authRouter.post("/change-password", requireAuth, verifyCsrf, authController.changePassword);
