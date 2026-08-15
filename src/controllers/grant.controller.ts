import { UnauthorizedError } from "@/errors/AppError.js";
import * as grantService from "@/services/grant.service.js";
import { asyncHandler } from "@/utils/asyncHandler.js";
import { uuidParamSchema } from "@/validation/common.schema.js";
import { setGrantsSchema } from "@/validation/grant.schema.js";

export const listScopes = asyncHandler(async (_req, res) => {
  res.json({ scopes: await grantService.listGrantableScopes() });
});

export const setGrants = asyncHandler(async (req, res) => {
  if (!req.user) throw new UnauthorizedError();
  const { id } = uuidParamSchema.parse(req.params);
  const { scopes } = setGrantsSchema.parse(req.body);
  res.json({ scopes: await grantService.setGrants(id, scopes, req.user.id) });
});
