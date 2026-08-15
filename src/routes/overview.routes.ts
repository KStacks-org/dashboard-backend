import { Router } from "express";
import * as githubController from "@/controllers/github.controller.js";
import * as overviewController from "@/controllers/overview.controller.js";

export const overviewRouter = Router();
overviewRouter.get("/", overviewController.get);

export const githubRouter = Router();
githubRouter.get("/activity", githubController.activity);
