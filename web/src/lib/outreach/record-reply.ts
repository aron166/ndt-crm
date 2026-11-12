import "server-only";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { reportError } from "@/lib/report-error";
import { threadKeyFor, type DraftStatus } from "@/lib/outreach/drafts";
import { runAutomations } from "@/lib/automations/engine";
import { canMarkReplied, type ReplyType } from "@/lib/outreach/campaign";
import { ingestLead } from "@/lib/leads/ingest";
import { startLeadLifecycle } from "@/lib/leads/lifecycle-sweep";
import { leadIntakeSchema } from "@/lib/leads/schema";

type Fail = { ok: false; error: string };

/**
 * A prospect answered a sent touch: one lead per thread, the draft flips to `replied`,
 * the remaining touches are cancelled. Shared by the "Válasz jött" button and the IMAP intake.
 * replyType null = not yet classified (a human does that).
 */
export async function recordDraftReply(
  tenantId: number,
  input: { draftId: number; replyType: ReplyType | null; note?: string; appSlug: string },
): Promise<{ ok: true; leadId: number; deduped: boolean } | Fail> {
  const { draftId, replyType, note, appSlug } = input;

  const row = await db.emailDraft.findFirst({
    where: { id: draftId, tenantId },
    include: {
      company: { select: { name: true } },
      person: { select: { firstName: true, lastName: true, email: true, phone: true } },
    },
  });
  if (!row) return { ok: false, error: "Piszkozat nem található" };
  if (!canMarkReplied(row.status as DraftStatus)) {
    return { ok: false, error: "Csak elküldött érintésre jöhet válasz" };
  }
  const email = row.toEmail ?? row.person?.email ?? null;
  const phone = row.person?.phone ?? null;
  if (!email && !phone) return { ok: false, error: "Nincs email cím vagy telefonszám a címzetthez" };

  const already = await db.emailDraft.findFirst({
    where: { tenantId, companyId: row.companyId, campaign: row.campaign, status: "replied" },
    select: { id: true },
  });
  if (already) return { ok: false, error: "Erre a megkeresésre már rögzítettünk választ" };

  const draftKey = row.threadKey ?? threadKeyFor(row.campaign, row.companyId);
  // One lead per CONVERSATION: the Gmail thread id when it was pasted, else one
  // manual key per outreach (campaign + company), so a second click dedupes. ponytail: if the reply-intake skill later reads the
  // same Gmail thread and no id was pasted, it creates a second lead — paste
  // the thread id on send to avoid it.
  const threadKey = (row.externalThreadId ?? `manual:${draftKey}`).toLowerCase();

  const intake = leadIntakeSchema.safeParse({
    company_name: row.company.name,
    contact_name: row.person ? `${row.person.firstName} ${row.person.lastName}`.trim() : undefined,
    contact_email: email ?? undefined,
    contact_phone: phone ?? undefined,
    message: note,
    source: "cold_email_reply",
    channel: "cold_email",
    campaign: row.campaign,
    thread_key: threadKey,
    draft_key: draftKey,
    reply_type: replyType ?? undefined,
  });
  if (!intake.success) return { ok: false, error: "Érvénytelen adat a lead létrehozásához" };

  try {
    const res = await db.$transaction((tx) =>
      ingestLead(intake.data, { tenantId, appSlug, draftId }, tx),
    );
    if (!res.deduped) {
      audit("email_draft", draftId, "update", { status: row.status }, { status: "replied", replyType, leadId: res.leadId }, { tenantId, actor: "user" as const });
      // Same post-commit steps as POST /api/leads: the W2 SLA timer, then the follow-up task rules.
      await startLeadLifecycle(tenantId, res.leadId);
      await runAutomations({
        type: "lead_created",
        tenantId,
        leadId: res.leadId,
        companyId: res.companyId,
        personId: res.personId,
        companyName: row.company.name,
        fields: {
          company: row.company.name, source: "cold_email_reply", channel: "cold_email",
          campaign: row.campaign, serviceInterest: null, message: note ?? null,
          sourceApp: appSlug, tier: res.tier, replyType,
        },
      });
    }
    return { ok: true, leadId: res.leadId, deduped: res.deduped };
  } catch (err) {
    reportError("outreach.markDraftReplied", err, { draftId });
    return { ok: false, error: "A válasz rögzítése nem sikerült" };
  }
}
