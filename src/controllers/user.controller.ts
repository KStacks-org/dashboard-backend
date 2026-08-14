import * as userService from "@/services/user.service.js";
import { asyncHandler } from "@/utils/asyncHandler.js";
import { searchUsersQuerySchema } from "@/validation/user.schema.js";

export const search = asyncHandler(async (req, res) => {
  const { q } = searchUsersQuerySchema.parse(req.query);
  const users = await userService.searchUsers(q);
  res.json({ users });
});
