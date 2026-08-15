import { z } from "zod";

/** Services are addressed by their stable codename (kindex, kplanner, …). */
export const codenameParamSchema = z.object({
  codename: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9-]+$/, "Invalid service codename"),
});

const optionalHttpUrl = z
  .string()
  .trim()
  .max(300)
  .url("Enter a valid URL")
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  }, "Only http and https links are allowed")
  .optional()
  .nullable()
  // An empty string from a cleared input means "no URL", not an invalid one.
  .or(z.literal("").transform(() => null));

/**
 * Only the team-authored fields are editable here. Name, tagline, description,
 * status and public URL mirror kstacks.org and are refreshed by the sync script.
 */
export const updateServiceSchema = z
  .object({
    overview: z.string().trim().max(20000).optional().nullable(),
    repoUrl: optionalHttpUrl,
    healthCheckUrl: optionalHttpUrl,
    ownerId: z.string().uuid("Invalid owner id").nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update",
  });

export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;
