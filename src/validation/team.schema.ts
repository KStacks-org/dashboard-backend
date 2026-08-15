import { z } from "zod";
import { universityEmailSchema } from "@/validation/auth.schema.js";

const responsibilities = z
  .array(z.string().trim().min(1).max(80))
  .max(20, "Twenty responsibilities is plenty")
  .optional();

export const createMemberSchema = z.object({
  email: universityEmailSchema,
  displayName: z.string().trim().min(1, "Name is required").max(100),
  jobTitle: z.string().trim().max(120).optional().nullable(),
  role: z.enum(["ADMIN", "MEMBER"]).default("MEMBER"),
  responsibilities,
});

export const updateMemberSchema = z.object({
  displayName: z.string().trim().min(1, "Name is required").max(100).optional(),
  jobTitle: z.string().trim().max(120).optional().nullable(),
  role: z.enum(["ADMIN", "MEMBER"]).optional(),
  responsibilities,
  isActive: z.boolean().optional(),
});

export type CreateMemberInput = z.infer<typeof createMemberSchema>;
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
