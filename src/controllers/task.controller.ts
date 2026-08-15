import { UnauthorizedError } from "@/errors/AppError.js";
import * as taskService from "@/services/task.service.js";
import { asyncHandler } from "@/utils/asyncHandler.js";
import { uuidParamSchema } from "@/validation/common.schema.js";
import {
  createTaskSchema,
  listTasksQuerySchema,
  updateTaskSchema,
} from "@/validation/task.schema.js";

export const list = asyncHandler(async (req, res) => {
  const { archived } = listTasksQuerySchema.parse(req.query);
  const tasks = await taskService.listTasks(archived ?? false);
  res.json({ tasks });
});

export const getOne = asyncHandler(async (req, res) => {
  const { id } = uuidParamSchema.parse(req.params);
  const task = await taskService.getTask(id);
  res.json({ task });
});

export const create = asyncHandler(async (req, res) => {
  if (!req.user) throw new UnauthorizedError();
  const data = createTaskSchema.parse(req.body);
  const task = await taskService.createTask(data, req.user.id);
  res.status(201).json({ task });
});

export const update = asyncHandler(async (req, res) => {
  const { id } = uuidParamSchema.parse(req.params);
  const data = updateTaskSchema.parse(req.body);
  const task = await taskService.updateTask(id, data, req.user?.id);
  res.json({ task });
});

export const archive = asyncHandler(async (req, res) => {
  const { id } = uuidParamSchema.parse(req.params);
  const task = await taskService.archiveTask(id);
  res.json({ task });
});

export const restore = asyncHandler(async (req, res) => {
  const { id } = uuidParamSchema.parse(req.params);
  const task = await taskService.restoreTask(id);
  res.json({ task });
});

export const remove = asyncHandler(async (req, res) => {
  if (!req.user) throw new UnauthorizedError();
  const { id } = uuidParamSchema.parse(req.params);
  await taskService.deleteTask(id, req.user.id, req.grants ?? { isSuperAdmin: false, scopes: [] });
  res.status(204).send();
});
