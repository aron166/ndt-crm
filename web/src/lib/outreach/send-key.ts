import "server-only";
import { createHash } from "node:crypto";

/**
 * Resend Idempotency-Key for one draft send. Varies with what is sent: Resend answers 409 for a reused key with a
 * different payload, so a draft edited after a failed send must get a new key (Vanda #196-1). The claim on the row
 * is what prevents a double send; this key only absorbs a retried HTTP call.
 */
export function draftSendKey(draftId: number, to: string, subject: string, text: string): string {
  return `draft-${draftId}-${createHash("sha256").update(`${to}\n${subject}\n${text}`).digest("hex").slice(0, 16)}`;
}
