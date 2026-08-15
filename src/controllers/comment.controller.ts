import { UnauthorizedError } from "@/errors/AppError.js";
import * as commentService from "@/services/comment.service.js";
import { asyncHandler } from "@/utils/asyncHandler.js";
import { createCommentSchema, updateCommentSchema } from "@/validation/comment.schema.js";
import { uuidParamSchema } from "@/validation/common.schema.js";

export const create = asyncHandler(async (req, res) => {
  if (!req.user) throw new UnauthorizedError();
  const { id: taskId } = uuidParamSchema.parse({ id: req.params.taskId });
  const { body } = createCommentSchema.parse(req.body);
  const comment = await commentService.addComment(taskId, req.user.id, body);
  res.status(201).json({ comment });
});

export const update = asyncHandler(async (req, res) => {
  if (!req.user) throw new UnauthorizedError();
  const { id } = uuidParamSchema.parse(req.params);
  const { body } = updateCommentSchema.parse(req.body);
  const comment = await commentService.updateComment(id, req.user.id, body);
  res.json({ comment });
});

export const remove = asyncHandler(async (req, res) => {
  if (!req.user) throw new UnauthorizedError();
  const { id } = uuidParamSchema.parse(req.params);
  await commentService.deleteComment(id, req.user.id);
  res.status(204).send();
});
