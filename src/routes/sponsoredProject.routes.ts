import { Router } from "express";
import * as sponsoredProjectController from "@/controllers/sponsoredProject.controller.js";

export const sponsoredProjectRouter = Router();

sponsoredProjectRouter.get("/", sponsoredProjectController.list);
sponsoredProjectRouter.post("/", sponsoredProjectController.create);
sponsoredProjectRouter.get("/:id", sponsoredProjectController.getOne);
sponsoredProjectRouter.patch("/:id", sponsoredProjectController.update);
sponsoredProjectRouter.delete("/:id", sponsoredProjectController.remove);
