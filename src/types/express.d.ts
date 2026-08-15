import type { Grants } from "@/lib/authz.js";
import type { User } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      user?: Omit<User, "passwordHash">;
      /** Admin scopes held by req.user, loaded alongside them. */
      grants?: Grants;
    }
  }
}
