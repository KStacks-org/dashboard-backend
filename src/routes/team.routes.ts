import { Router } from "express";
import * as grantController from "@/controllers/grant.controller.js";
import * as teamController from "@/controllers/team.controller.js";
import { requireDashboardAdmin, requireSuperAdmin } from "@/middleware/admin.js";

export const teamRouter = Router();

// Everyone can see the roster; only an admin changes it.
teamRouter.get("/", teamController.list);
teamRouter.post("/", requireDashboardAdmin, teamController.create);
teamRouter.patch("/:id", requireDashboardAdmin, teamController.update);

// Everyone can see which scopes exist — the Team page renders them as labels —
// but only a super admin can change who holds what.
teamRouter.get("/scopes", grantController.listScopes);
teamRouter.put("/:id/grants", requireSuperAdmin, grantController.setGrants);
