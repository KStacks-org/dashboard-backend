import { z } from "zod";

export const sponsoredProjectStatusSchema = z.enum([
  "PROPOSED",
  "IN_REVIEW",
  "ACTIVE",
  "LAUNCHED",
  "ARCHIVED",
]);

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
  .or(z.literal("").transform(() => null));

export const createSponsoredProjectSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  description: z.string().trim().min(1, "Description is required").max(5000),
  ownerName: z.string().trim().min(1, "Owner name is required").max(120),
  contact: z.string().trim().max(200).optional().nullable(),
  projectUrl: optionalHttpUrl,
  repoUrl: optionalHttpUrl,
  status: sponsoredProjectStatusSchema.default("PROPOSED"),
  resources: z.string().trim().max(5000).optional().nullable(),
  notes: z.string().trim().max(20000).optional().nullable(),
});

export const updateSponsoredProjectSchema = createSponsoredProjectSchema.partial();

export type CreateSponsoredProjectInput = z.infer<typeof createSponsoredProjectSchema>;
export type UpdateSponsoredProjectInput = z.infer<typeof updateSponsoredProjectSchema>;
