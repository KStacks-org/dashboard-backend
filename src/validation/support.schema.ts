import { z } from "zod";

/**
 * `website` is a honeypot: a field no real visitor sees or fills, styled
 * off-screen by the widget. A simple bot that auto-fills every input trips
 * it; a real person never does. Not a defense against a targeted attacker —
 * paired with rate limiting, it is enough for a first version.
 */
const honeypot = z.string().max(0, "Spam detected").optional().default("");

export const createConversationSchema = z.object({
  serviceCodename: z.string().trim().min(1).max(50),
  pageContext: z.string().trim().max(300).optional(),
  reporterName: z.string().trim().min(1, "Enter your name").max(100),
  reporterEmail: z.string().trim().email("Enter a valid email").max(200),
  body: z.string().trim().min(1, "Describe the problem first").max(5000),
  website: honeypot,
});

export const addReporterMessageSchema = z.object({
  body: z.string().trim().min(1, "Write something first").max(5000),
  website: honeypot,
});

export const addStaffReplySchema = z.object({
  body: z.string().trim().min(1, "Write something first").max(5000),
  asOrg: z.boolean().optional().default(false),
});

export type CreateConversationInput = z.infer<typeof createConversationSchema>;
export type AddReporterMessageInput = z.infer<typeof addReporterMessageSchema>;
export type AddStaffReplyInput = z.infer<typeof addStaffReplySchema>;
