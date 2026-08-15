import { z } from "zod";

/**
 * Links are rendered as clickable anchors, so the scheme is restricted to
 * http/https — this is what stops a `javascript:` or `data:` URL from being
 * stored and later clicked.
 */
const safeUrl = z
  .string()
  .trim()
  .min(1, "URL is required")
  .max(2000)
  .url("Enter a valid URL")
  .refine((value) => {
    try {
      const protocol = new URL(value).protocol;
      return protocol === "http:" || protocol === "https:";
    } catch {
      return false;
    }
  }, "Only http and https links are allowed");

export const createLinkSchema = z.object({
  url: safeUrl,
  label: z.string().trim().max(120).optional().nullable(),
});

export type CreateLinkInput = z.infer<typeof createLinkSchema>;
