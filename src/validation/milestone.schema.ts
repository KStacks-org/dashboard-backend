import { z } from "zod";

export const createMilestoneSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(150),
  description: z.string().trim().max(5000).optional().nullable(),
  deadline: z.coerce.date().optional().nullable(),
  sortOrder: z.coerce.number().int().min(0).max(999).optional(),
});

export const updateMilestoneSchema = createMilestoneSchema.partial();

export type CreateMilestoneInput = z.infer<typeof createMilestoneSchema>;
export type UpdateMilestoneInput = z.infer<typeof updateMilestoneSchema>;
