import "server-only";
import { db } from "@/lib/db";
import { normalizeEmail } from "@/lib/email";
import { reportError } from "@/lib/report-error";
import { recordOutcome } from "@/lib/campaigns/service";
import { OPEN_MEMBER_STATES } from "@/lib/campaigns/rules";
import { signPayload } from "./token";

/** Signed one-click unsubscribe URL for one campaign e-mail. */
export function unsubscribeUrl(tenantId: number, email: string, draftId: number): string {
  const { d, s } = signPayload("unsub", { t: tenantId, e: normalizeEmail(email), r: draftId });
  const base = process.env.APP_BASE_URL ?? "https://ndt-crm.vercel.app";
  return `${base}/api/outreach/unsubscribe?d=${encodeURIComponent(d)}&s=${encodeURIComponent(s)}`;
}

/** RFC 8058 headers. Throws without ENCRYPTION_KEY: the caller must refuse to send. */
export function unsubscribeHeaders(tenantId: number, email: string, draftId: number): Record<string, string> {
  return {
    "List-Unsubscribe": `<${unsubscribeUrl(tenantId, email, draftId)}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

/**
 * Suppress the address, cancel the rest of that outreach and close the campaign member.
 * Shared by the unsubscribe route; the Resend webhook and IMAP intake will call it too.
 */
export async function applyOptOut(
  tenantId: number,
  rawEmail: string,
  opts: { kind: "unsubscribe" | "bounce" | "complaint"; source: string; draftId?: number | null; agent: string },
): Promise<{ suppressed: true; memberUpdated: boolean }> {
  const email = normalizeEmail(rawEmail);
  if (!email) throw new Error("applyOptOut: empty email");

  const existing = await db.suppression.findFirst({ where: { tenantId, email }, select: { id: true } });
  if (!existing) {
    try {
      await db.suppression.create({
        data: { tenantId, email, requestedAt: new Date(), channel: "email", source: opts.source, note: opts.kind },
      });
    } catch (err) {
      // A retried one-click POST racing the first one: already suppressed is success.
      if ((err as { code?: string }).code !== "P2002") throw err;
    }
  }

  const draft = opts.draftId != null
    ? await db.emailDraft.findFirst({ where: { id: opts.draftId, tenantId }, select: { companyId: true, campaign: true } })
    : await db.emailDraft.findFirst({
        where: { tenantId, status: { in: ["sent", "replied"] }, toEmail: { equals: email, mode: "insensitive" } },
        orderBy: { sentAt: "desc" },
        select: { companyId: true, campaign: true },
      });
  if (!draft) return { suppressed: true, memberUpdated: false };

  // `failed` too: it is sendable by hand.
  await db.emailDraft.updateMany({
    where: { tenantId, companyId: draft.companyId, campaign: draft.campaign, status: { in: ["draft", "approved", "failed"] } },
    data: { status: "cancelled" },
  });

  const campaign = await db.campaign.findFirst({ where: { tenantId, slug: draft.campaign }, select: { id: true } });
  const member = campaign
    ? await db.campaignMember.findFirst({ where: { tenantId, campaignId: campaign.id, companyId: draft.companyId }, select: { id: true, state: true } })
    : null;
  if (!campaign || !member || !OPEN_MEMBER_STATES.includes(member.state as never)) {
    return { suppressed: true, memberUpdated: false };
  }
  const res = await recordOutcome(
    { tenantId, userId: null, appSlug: opts.agent },
    draft.campaign,
    { member_id: member.id, outcome: opts.kind === "bounce" ? "bounce" : "unsubscribe", email },
  );
  if ("error" in res) {
    reportError("outreach.applyOptOut", new Error(res.error), { tenantId, memberId: member.id });
    return { suppressed: true, memberUpdated: false };
  }
  return { suppressed: true, memberUpdated: true };
}
