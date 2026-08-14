import { Router } from "express";
import * as serviceController from "@/controllers/service.controller.js";

export const serviceRouter = Router();

serviceRouter.get("/", serviceController.list);
