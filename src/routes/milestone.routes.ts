import { Router } from "express";
import * as milestoneController from "@/controllers/milestone.controller.js";

export const milestoneRouter = Router();

milestoneRouter.get("/", milestoneController.list);
milestoneRouter.post("/", milestoneController.create);
milestoneRouter.get("/:id", milestoneController.getOne);
milestoneRouter.patch("/:id", milestoneController.update);
milestoneRouter.delete("/:id", milestoneController.remove);
