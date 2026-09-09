import { Router } from "express";
import * as grantController from "@/controllers/grant.controller.js";
import * as teamController from "@/controllers/team.controller.js";
import {
  requireDashboardAdmin,
  requireGrantManager,
  requireSuperAdmin,
  requireTeamMemberCreator,
} from "@/middleware/admin.js";

export const teamRouter = Router();

// Everyone can see the roster. A service admin may add identities, while
// editing/deactivation still needs dashboard-wide authority.
teamRouter.get("/", teamController.list);
teamRouter.post("/", requireTeamMemberCreator, teamController.create);
teamRouter.patch("/:id", requireDashboardAdmin, teamController.update);

// Everyone can see which scopes exist — the Team page renders them as labels —
// Super admins manage everything; service admins only delegate child roles.
teamRouter.get("/scopes", grantController.listScopes);
teamRouter.post("/scopes/:serviceId/roles", requireSuperAdmin, grantController.createServiceRole);
teamRouter.delete(
  "/scopes/:serviceId/roles/:roleId",
  requireSuperAdmin,
  grantController.deleteServiceRole,
);
teamRouter.put("/:id/grants", requireGrantManager, grantController.setGrants);
