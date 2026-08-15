import { Router } from "express";
import * as teamController from "@/controllers/team.controller.js";
import { requireAdmin } from "@/middleware/admin.js";

export const teamRouter = Router();

// Everyone can see the roster; only an admin changes it.
teamRouter.get("/", teamController.list);
teamRouter.post("/", requireAdmin, teamController.create);
teamRouter.patch("/:id", requireAdmin, teamController.update);
