import { z } from "zod";
import { env } from "@/config/env.js";

/** `user@sub.example.edu` → `sub.example.edu` */
function domainOf(email: string): string {
  return email.slice(email.lastIndexOf("@") + 1).toLowerCase();
}

export function isAllowedEmailDomain(email: string): boolean {
  return env.ALLOWED_EMAIL_DOMAINS.includes(domainOf(email));
}

export const universityEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Email is required")
  .max(200)
  .email("Enter a valid email address")
  .refine(
    isAllowedEmailDomain,
    `Use your university email (@${env.ALLOWED_EMAIL_DOMAINS.join(", @")})`,
  );
