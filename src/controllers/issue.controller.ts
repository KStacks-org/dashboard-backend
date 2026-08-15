import { UnauthorizedError } from "@/errors/AppError.js";
import * as issueService from "@/services/issue.service.js";
import { asyncHandler } from "@/utils/asyncHandler.js";
import { uuidParamSchema } from "@/validation/common.schema.js";
import { createIssueSchema, updateIssueSchema } from "@/validation/issue.schema.js";

export const list = asyncHandler(async (_req, res) => {
  const issues = await issueService.listIssues();
  res.json({ issues });
});

export const getOne = asyncHandler(async (req, res) => {
  const { id } = uuidParamSchema.parse(req.params);
  const issue = await issueService.getIssue(id);
  res.json({ issue });
});

export const create = asyncHandler(async (req, res) => {
  if (!req.user) throw new UnauthorizedError();
  const data = createIssueSchema.parse(req.body);
  const issue = await issueService.createIssue(data, req.user.id);
  res.status(201).json({ issue });
});

export const update = asyncHandler(async (req, res) => {
  if (!req.user) throw new UnauthorizedError();
  const { id } = uuidParamSchema.parse(req.params);
  const data = updateIssueSchema.parse(req.body);
  const issue = await issueService.updateIssue(id, data, req.user.id);
  res.json({ issue });
});

export const remove = asyncHandler(async (req, res) => {
  if (!req.user) throw new UnauthorizedError();
  const { id } = uuidParamSchema.parse(req.params);
  await issueService.deleteIssue(id, req.user.id);
  res.status(204).send();
});

export const convert = asyncHandler(async (req, res) => {
  if (!req.user) throw new UnauthorizedError();
  const { id } = uuidParamSchema.parse(req.params);
  const issue = await issueService.convertToTask(id, req.user.id);
  res.json({ issue });
});
