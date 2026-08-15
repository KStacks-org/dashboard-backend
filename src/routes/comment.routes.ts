import { Router } from "express";
import * as commentController from "@/controllers/comment.controller.js";

export const commentRouter = Router();

commentRouter.patch("/:id", commentController.update);
commentRouter.delete("/:id", commentController.remove);
