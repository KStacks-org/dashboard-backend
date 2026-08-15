import * as githubService from "@/services/github.service.js";
import { asyncHandler } from "@/utils/asyncHandler.js";

export const activity = asyncHandler(async (req, res) => {
  const activity = await githubService.getActivity(req.query.refresh === "true");
  res.json({ activity });
});
