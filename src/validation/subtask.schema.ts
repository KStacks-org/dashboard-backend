import { z } from "zod";

export const createSubtaskSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
});

export const updateSubtaskSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(200).optional(),
    isCompleted: z.boolean().optional(),
  })
  .refine((data) => data.title !== undefined || data.isCompleted !== undefined, {
    message: "Provide at least one field to update",
  });

export type CreateSubtaskInput = z.infer<typeof createSubtaskSchema>;
export type UpdateSubtaskInput = z.infer<typeof updateSubtaskSchema>;
