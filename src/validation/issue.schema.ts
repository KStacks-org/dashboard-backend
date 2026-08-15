import { z } from "zod";
import { prioritySchema } from "@/validation/task.schema.js";

export const issueStatusSchema = z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]);

export const createIssueSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().trim().max(5000).optional().nullable(),
  priority: prioritySchema.default("MEDIUM"),
  status: issueStatusSchema.default("OPEN"),
  serviceId: z.string().uuid("Invalid service id").optional().nullable(),
  assigneeId: z.string().uuid("Invalid assignee id").optional().nullable(),
});

export const updateIssueSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200).optional(),
  description: z.string().trim().max(5000).optional().nullable(),
  priority: prioritySchema.optional(),
  status: issueStatusSchema.optional(),
  serviceId: z.string().uuid("Invalid service id").nullable().optional(),
  assigneeId: z.string().uuid("Invalid assignee id").nullable().optional(),
});

export type CreateIssueInput = z.infer<typeof createIssueSchema>;
export type UpdateIssueInput = z.infer<typeof updateIssueSchema>;
