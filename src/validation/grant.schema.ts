import { z } from "zod";

export const setGrantsSchema = z.object({
  // Validated against the live catalogue in the service; the shape check here
  // only keeps obvious junk out of the query.
  scopes: z.array(z.string().trim().min(1).max(50)).max(50),
});

export type SetGrantsInput = z.infer<typeof setGrantsSchema>;
