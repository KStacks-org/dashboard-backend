import { Router } from "express";
import * as issueController from "@/controllers/issue.controller.js";

export const issueRouter = Router();

issueRouter.get("/", issueController.list);
issueRouter.post("/", issueController.create);
issueRouter.get("/:id", issueController.getOne);
issueRouter.patch("/:id", issueController.update);
issueRouter.delete("/:id", issueController.remove);
issueRouter.post("/:id/convert", issueController.convert);
