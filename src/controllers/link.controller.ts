import * as linkService from "@/services/link.service.js";
import { asyncHandler } from "@/utils/asyncHandler.js";
import { uuidParamSchema } from "@/validation/common.schema.js";
import { createLinkSchema } from "@/validation/link.schema.js";

export const create = asyncHandler(async (req, res) => {
  const { id: taskId } = uuidParamSchema.parse({ id: req.params.taskId });
  const { url, label } = createLinkSchema.parse(req.body);
  const link = await linkService.addLink(taskId, url, label);
  res.status(201).json({ link });
});

export const remove = asyncHandler(async (req, res) => {
  const { id } = uuidParamSchema.parse(req.params);
  await linkService.deleteLink(id);
  res.status(204).send();
});
