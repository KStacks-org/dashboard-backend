import { Router } from "express";
import * as subtaskController from "@/controllers/subtask.controller.js";

export const subtaskRouter = Router();

subtaskRouter.patch("/:id", subtaskController.update);
subtaskRouter.delete("/:id", subtaskController.remove);
