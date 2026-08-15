import { UnauthorizedError } from "@/errors/AppError.js";
import * as overviewService from "@/services/overview.service.js";
import { asyncHandler } from "@/utils/asyncHandler.js";

export const get = asyncHandler(async (req, res) => {
  if (!req.user) throw new UnauthorizedError();
  const overview = await overviewService.getOverview(req.user.id);
  res.json(overview);
});
