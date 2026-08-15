import * as sponsoredProjectService from "@/services/sponsoredProject.service.js";
import { asyncHandler } from "@/utils/asyncHandler.js";
import { uuidParamSchema } from "@/validation/common.schema.js";
import {
  createSponsoredProjectSchema,
  updateSponsoredProjectSchema,
} from "@/validation/sponsoredProject.schema.js";

export const list = asyncHandler(async (_req, res) => {
  const projects = await sponsoredProjectService.listSponsoredProjects();
  res.json({ projects });
});

export const getOne = asyncHandler(async (req, res) => {
  const { id } = uuidParamSchema.parse(req.params);
  const project = await sponsoredProjectService.getSponsoredProject(id);
  res.json({ project });
});

export const create = asyncHandler(async (req, res) => {
  const data = createSponsoredProjectSchema.parse(req.body);
  const project = await sponsoredProjectService.createSponsoredProject(data);
  res.status(201).json({ project });
});

export const update = asyncHandler(async (req, res) => {
  const { id } = uuidParamSchema.parse(req.params);
  const data = updateSponsoredProjectSchema.parse(req.body);
  const project = await sponsoredProjectService.updateSponsoredProject(id, data);
  res.json({ project });
});

export const remove = asyncHandler(async (req, res) => {
  const { id } = uuidParamSchema.parse(req.params);
  await sponsoredProjectService.deleteSponsoredProject(id);
  res.status(204).send();
});
