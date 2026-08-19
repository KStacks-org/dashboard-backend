import { logger } from "@/lib/logger.js";

/**
 * The seam for telling a reporter their thread got a reply, once outbound
 * email exists. No provider is configured yet, so this only logs — nothing
 * else in the support flow needs to change when a real one is wired in here;
 * every caller already has everything a real email would need, because the
 * conversation's `token` was designed from the start to double as the link a
 * notification would point at.
 */
export function notifyReporterOfReply(input: {
  reporterEmail: string;
  reporterName: string;
  conversationToken: string;
}) {
  logger.info(
    { reporterEmail: input.reporterEmail, token: input.conversationToken },
    "Would email reporter about a new reply (no email provider configured)",
  );
}
