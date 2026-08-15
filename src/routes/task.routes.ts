import { Router } from "express";
import * as commentController from "@/controllers/comment.controller.js";
import * as linkController from "@/controllers/link.controller.js";
import * as subtaskController from "@/controllers/subtask.controller.js";
import * as taskController from "@/controllers/task.controller.js";

export const taskRouter = Router();

taskRouter.get("/", taskController.list);
taskRouter.post("/", taskController.create);
taskRouter.get("/:id", taskController.getOne);
taskRouter.patch("/:id", taskController.update);
taskRouter.post("/:id/archive", taskController.archive);
taskRouter.post("/:id/restore", taskController.restore);
taskRouter.delete("/:id", taskController.remove);

taskRouter.post("/:taskId/subtasks", subtaskController.create);
taskRouter.patch("/:taskId/subtasks/reorder", subtaskController.reorder);
taskRouter.post("/:taskId/comments", commentController.create);
taskRouter.post("/:taskId/links", linkController.create);
