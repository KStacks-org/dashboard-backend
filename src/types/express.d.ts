import type { Grants } from "@/lib/authz.js";
import type { User } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      user?: User;
      /** Admin scopes held by req.user, loaded alongside them. */
      grants?: Grants;
      /**
       * Set when auth-service's token confirms who the caller is, but the
       * address is absent from — or deactivated on — this app's roster.
       * Distinct from "no token at all" so a caller can send them to a "you
       * don't have access" page instead of back into the login redirect,
       * which would just loop (auth-service keeps recognising them).
       */
      deniedIdentity?: { email: string; name: string };
    }
  }
}
