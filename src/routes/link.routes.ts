import { Router } from "express";
import * as linkController from "@/controllers/link.controller.js";

export const linkRouter = Router();

linkRouter.delete("/:id", linkController.remove);
