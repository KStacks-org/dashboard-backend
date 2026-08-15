import { z } from "zod";

export const createSubtaskSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  assigneeId: z.string().uuid("Invalid assignee id").optional().nullable(),
});

export const updateSubtaskSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(200).optional(),
    isCompleted: z.boolean().optional(),
    // `null` clears the owner; omitting the key leaves it untouched.
    assigneeId: z.string().uuid("Invalid assignee id").nullable().optional(),
  })
  .refine(
    (data) =>
      data.title !== undefined || data.isCompleted !== undefined || data.assigneeId !== undefined,
    { message: "Provide at least one field to update" },
  );

export const reorderSubtasksSchema = z.object({
  orderedIds: z
    .array(z.string().uuid("Invalid subtask id"))
    .min(1, "Provide the subtask order")
    .max(200)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "Duplicate subtask ids are not allowed",
    }),
});

export type CreateSubtaskInput = z.infer<typeof createSubtaskSchema>;
export type UpdateSubtaskInput = z.infer<typeof updateSubtaskSchema>;
export type ReorderSubtasksInput = z.infer<typeof reorderSubtasksSchema>;
