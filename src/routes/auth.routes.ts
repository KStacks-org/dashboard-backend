import { Router } from "express";
import * as authController from "@/controllers/auth.controller.js";
import { requireAuth } from "@/middleware/auth.js";

export const authRouter = Router();

// No requireAuth: the controller itself distinguishes "never signed in" from
// "auth-service knows them, but they're not on this app's roster" — a gate
// here would collapse that distinction back into one generic 401.
authRouter.get("/me", authController.me);
// No requireAuth either: signing out has to work even for a denied identity,
// so they can clear the cookies and try a different account.
authRouter.post("/logout", authController.logout);
// The token other KStack services read. A GET with no body: it grants nothing
// new, it only states what the caller's identity already established.
authRouter.get("/token", requireAuth, authController.serviceToken);
