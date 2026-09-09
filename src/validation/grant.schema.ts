import { z } from "zod";

export const setGrantsSchema = z.object({
  // Validated against the live catalogue in the service; the shape check here
  // only keeps obvious junk out of the query.
  scopes: z.array(z.string().trim().min(1).max(100)).max(100),
  // Optional for compatibility with already-open admin pages; omission keeps
  // the current membership decision unchanged.
  hasDashboardAccess: z.boolean().optional(),
});

export const createServiceAccessRoleSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Role name is required")
    .max(40)
    .transform((value) => value.toUpperCase().replace(/\s+/g, "_"))
    .pipe(
      z
        .string()
        .regex(/^[A-Z][A-Z0-9_]*$/, "Use English letters, numbers, and underscores only")
        .refine((value) => value !== "ADMIN", "ADMIN is already built in"),
    ),
});

export const deleteServiceAccessRoleSchema = z.object({
  confirmation: z.string().min(1).max(100),
});

export type SetGrantsInput = z.infer<typeof setGrantsSchema>;
export type CreateServiceAccessRoleInput = z.infer<typeof createServiceAccessRoleSchema>;
export type DeleteServiceAccessRoleInput = z.infer<typeof deleteServiceAccessRoleSchema>;
