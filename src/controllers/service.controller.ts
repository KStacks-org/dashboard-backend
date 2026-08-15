import * as healthService from "@/services/health.service.js";
import * as serviceCatalogService from "@/services/serviceCatalog.service.js";
import { asyncHandler } from "@/utils/asyncHandler.js";
import { uuidParamSchema } from "@/validation/common.schema.js";
import { codenameParamSchema, updateServiceSchema } from "@/validation/service.schema.js";

export const list = asyncHandler(async (_req, res) => {
  const services = await serviceCatalogService.listServices();
  res.json({ services });
});

export const getOne = asyncHandler(async (req, res) => {
  const { codename } = codenameParamSchema.parse(req.params);
  const service = await serviceCatalogService.getService(codename);
  res.json({ service });
});

export const update = asyncHandler(async (req, res) => {
  const { codename } = codenameParamSchema.parse(req.params);
  const data = updateServiceSchema.parse(req.body);
  const service = await serviceCatalogService.updateService(codename, data);
  res.json({ service });
});

export const health = asyncHandler(async (_req, res) => {
  const services = await healthService.getHealthOverview();
  res.json({ services });
});

export const checkNow = asyncHandler(async (req, res) => {
  const { id } = uuidParamSchema.parse(req.params);
  const check = await healthService.checkServiceNow(id);
  res.json({ check });
});
