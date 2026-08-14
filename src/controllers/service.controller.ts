import * as serviceCatalogService from "@/services/serviceCatalog.service.js";
import { asyncHandler } from "@/utils/asyncHandler.js";

export const list = asyncHandler(async (_req, res) => {
  const services = await serviceCatalogService.listServices();
  res.json({ services });
});
