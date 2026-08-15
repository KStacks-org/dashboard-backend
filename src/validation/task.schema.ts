import { z } from "zod";

export const prioritySchema = z.enum(["LOW", "MEDIUM", "HIGH"]);
export const taskStatusSchema = z.enum(["TODO", "IN_PROGRESS", "BLOCKED"]);

const assigneeIdsSchema = z
  .array(z.string().uuid("Invalid assignee id"))
  .min(1, "Select at least one assignee")
  .max(50)
  .refine((ids) => new Set(ids).size === ids.length, {
    message: "Duplicate assignees are not allowed",
  });

export const createTaskSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().trim().max(5000).optional().nullable(),
  deadline: z.coerce.date().optional().nullable(),
  priority: prioritySchema.default("MEDIUM"),
  status: taskStatusSchema.default("TODO"),
  serviceId: z.string().uuid("Invalid service id").optional().nullable(),
  milestoneId: z.string().uuid("Invalid milestone id").optional().nullable(),
  assigneeIds: assigneeIdsSchema,
});

export const updateTaskSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200).optional(),
  description: z.string().trim().max(5000).optional().nullable(),
  deadline: z.coerce.date().optional().nullable(),
  priority: prioritySchema.optional(),
  status: taskStatusSchema.optional(),
  serviceId: z.string().uuid("Invalid service id").optional().nullable(),
  milestoneId: z.string().uuid("Invalid milestone id").optional().nullable(),
  assigneeIds: assigneeIdsSchema.optional(),
});

export const listTasksQuerySchema = z.object({
  archived: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
