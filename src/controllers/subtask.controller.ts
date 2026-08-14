import * as subtaskService from "@/services/subtask.service.js";
import { asyncHandler } from "@/utils/asyncHandler.js";
import { uuidParamSchema } from "@/validation/common.schema.js";
import { createSubtaskSchema, updateSubtaskSchema } from "@/validation/subtask.schema.js";

export const create = asyncHandler(async (req, res) => {
  const { id: taskId } = uuidParamSchema.parse({ id: req.params.taskId });
  const { title } = createSubtaskSchema.parse(req.body);
  const subtask = await subtaskService.addSubtask(taskId, title);
  res.status(201).json({ subtask });
});

export const update = asyncHandler(async (req, res) => {
  const { id } = uuidParamSchema.parse(req.params);
  const data = updateSubtaskSchema.parse(req.body);
  const subtask = await subtaskService.updateSubtask(id, data);
  res.json({ subtask });
});

export const remove = asyncHandler(async (req, res) => {
  const { id } = uuidParamSchema.parse(req.params);
  await subtaskService.deleteSubtask(id);
  res.status(204).send();
});
