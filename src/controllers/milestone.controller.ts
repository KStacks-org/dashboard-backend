import * as milestoneService from "@/services/milestone.service.js";
import { asyncHandler } from "@/utils/asyncHandler.js";
import { uuidParamSchema } from "@/validation/common.schema.js";
import { createMilestoneSchema, updateMilestoneSchema } from "@/validation/milestone.schema.js";

export const list = asyncHandler(async (_req, res) => {
  const milestones = await milestoneService.listMilestones();
  res.json({ milestones });
});

export const getOne = asyncHandler(async (req, res) => {
  const { id } = uuidParamSchema.parse(req.params);
  const milestone = await milestoneService.getMilestone(id);
  res.json({ milestone });
});

export const create = asyncHandler(async (req, res) => {
  const data = createMilestoneSchema.parse(req.body);
  const milestone = await milestoneService.createMilestone(data);
  res.status(201).json({ milestone });
});

export const update = asyncHandler(async (req, res) => {
  const { id } = uuidParamSchema.parse(req.params);
  const data = updateMilestoneSchema.parse(req.body);
  const milestone = await milestoneService.updateMilestone(id, data);
  res.json({ milestone });
});

export const remove = asyncHandler(async (req, res) => {
  const { id } = uuidParamSchema.parse(req.params);
  await milestoneService.deleteMilestone(id);
  res.status(204).send();
});
