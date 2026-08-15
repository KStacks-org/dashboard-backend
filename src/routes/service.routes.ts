import { Router } from "express";
import * as serviceController from "@/controllers/service.controller.js";

export const serviceRouter = Router();

// Declared before "/:codename" so "health" is never read as a codename.
serviceRouter.get("/health", serviceController.health);
serviceRouter.post("/:id/check", serviceController.checkNow);

serviceRouter.get("/", serviceController.list);
serviceRouter.get("/:codename", serviceController.getOne);
serviceRouter.patch("/:codename", serviceController.update);
