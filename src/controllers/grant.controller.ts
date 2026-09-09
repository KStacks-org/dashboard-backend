import { UnauthorizedError } from "@/errors/AppError.js";
import * as grantService from "@/services/grant.service.js";
import { asyncHandler } from "@/utils/asyncHandler.js";
import { uuidParamSchema } from "@/validation/common.schema.js";
import {
  createServiceAccessRoleSchema,
  deleteServiceAccessRoleSchema,
  setGrantsSchema,
} from "@/validation/grant.schema.js";

export const listScopes = asyncHandler(async (_req, res) => {
  res.json({ scopes: await grantService.listGrantableScopes() });
});

export const createServiceRole = asyncHandler(async (req, res) => {
  const { id: serviceId } = uuidParamSchema.parse({ id: req.params.serviceId });
  const data = createServiceAccessRoleSchema.parse(req.body);
  res.status(201).json({ scope: await grantService.createServiceAccessRole(serviceId, data) });
});

export const deleteServiceRole = asyncHandler(async (req, res) => {
  const { id: serviceId } = uuidParamSchema.parse({ id: req.params.serviceId });
  const { id: roleId } = uuidParamSchema.parse({ id: req.params.roleId });
  const data = deleteServiceAccessRoleSchema.parse(req.body);
  await grantService.deleteServiceAccessRole(serviceId, roleId, data);
  res.status(204).send();
});

export const setGrants = asyncHandler(async (req, res) => {
  if (!req.user || !req.grants) throw new UnauthorizedError();
  const { id } = uuidParamSchema.parse(req.params);
  const { scopes, hasDashboardAccess } = setGrantsSchema.parse(req.body);
  res.json(
    await grantService.setGrants(id, scopes, hasDashboardAccess, {
      id: req.user.id,
      isSuperAdmin: req.grants.isSuperAdmin,
      scopes: req.grants.scopes,
    }),
  );
});
