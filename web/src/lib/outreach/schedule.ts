import type { Prisma } from "@prisma/client";
import { isValidStep } from "./drafts";
import { dueAtForStep } from "./campaign";

/**
 * After touch N went out (by hand OR via Resend), put touch N+1 on the
 * calendar: anchored on touch 1's real send time (SEQUENCE_OFFSET_DAYS).
 * Only still-unsent rows are rescheduled. Returns the new due date or null.
 */
export async function scheduleNextTouch(
  tx: Prisma.TransactionClient,
  row: { tenantId: number; companyId: number; campaign: string; step: number },
  sentAt: Date,
): Promise<Date | null> {
  const nextStep = row.step + 1;
  if (!isValidStep(nextStep)) return null;
  const first = row.step === 1
    ? sentAt
    : (await tx.emailDraft.findFirst({
        where: { tenantId: row.tenantId, companyId: row.companyId, campaign: row.campaign, step: 1 },
        select: { sentAt: true },
      }))?.sentAt ?? sentAt;
  const due = dueAtForStep(first, nextStep);
  if (!due) return null;
  await tx.emailDraft.updateMany({
    where: {
      tenantId: row.tenantId, companyId: row.companyId, campaign: row.campaign, step: nextStep,
      status: { in: ["draft", "approved", "failed"] },
    },
    data: { dueAt: due },
  });
  return due;
}
