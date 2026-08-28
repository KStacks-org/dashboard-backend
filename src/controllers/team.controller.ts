import { UnauthorizedError } from "@/errors/AppError.js";
import * as teamService from "@/services/team.service.js";
import { asyncHandler } from "@/utils/asyncHandler.js";
import { uuidParamSchema } from "@/validation/common.schema.js";
import { createMemberSchema, updateMemberSchema } from "@/validation/team.schema.js";

export const list = asyncHandler(async (_req, res) => {
  const members = await teamService.listTeam();
  res.json({ members });
});

export const create = asyncHandler(async (req, res) => {
  if (!req.user || !req.grants) throw new UnauthorizedError();
  const data = createMemberSchema.parse(req.body);
  const member = await teamService.createMember(data, {
    id: req.user.id,
    isSuperAdmin: req.grants.isSuperAdmin,
  });
  res.status(201).json({ member });
});

export const update = asyncHandler(async (req, res) => {
  if (!req.user || !req.grants) throw new UnauthorizedError();
  const { id } = uuidParamSchema.parse(req.params);
  const data = updateMemberSchema.parse(req.body);
  const member = await teamService.updateMember(id, data, {
    id: req.user.id,
    isSuperAdmin: req.grants.isSuperAdmin,
  });
  res.json({ member });
});
