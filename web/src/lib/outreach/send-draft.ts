import "server-only";
import type { EmailDraft } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { reportError } from "@/lib/report-error";
import { gateDraft } from "@/lib/outreach/template";
import { advanceOnSent, campaignSendBlock } from "@/lib/campaigns/service";
import { sendEmail } from "@/lib/integrations/resend";
import { isAddressSuppressed, SUPPRESSED_ERROR } from "@/lib/suppression";
import { resolveDraftRecipient } from "@/lib/outreach/recipient";
import { unsubscribeHeaders } from "@/lib/outreach/unsubscribe";
import { draftSendKey } from "@/lib/outreach/send-key";
import { scheduleNextTouch } from "@/lib/outreach/schedule";
import { threadKeyFor, withFooter } from "@/lib/outreach/drafts";

// The gated sender's core, shared by the human click (actions/email-drafts sendDraft) and the
// scheduler (campaigns/scheduled-send). Neither path may skip prepare; the caller claims the row
// between the two calls.

const AUDIT_TYPE = "email_draft" as const;

export type Prepared =
  | { ok: true; to: string; text: string; replyTo: string | null; headers: Record<string, string> }
  | { ok: false; error: string };

/** Every refusal that leaves the row sendable: template gate, campaign running, footer, recipient, suppression, unsubscribe link. */
export async function prepareDraftSend(tenantId: number, row: EmailDraft): Promise<Prepared> {
  // §6b: same template gate as the copy and the manual-send paths.
  const gate = await gateDraft(tenantId, row.campaign, row.step);
  if (!gate.ok) return { ok: false, error: gate.error };
  const blocked = await campaignSendBlock(tenantId, row.campaign);
  if (blocked) return { ok: false, error: blocked };

  // The consent/unsubscribe line is not optional. Without this guard a tenant
  // who never opened the settings panel cold-emails with no opt-out at all -
  // the placeholder in the UI is an HTML attribute, not a stored value.
  const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
  const s = (tenant?.settings as Record<string, unknown> | null) ?? {};
  const footer = typeof s.outreachFooter === "string" ? s.outreachFooter.trim() : "";
  if (!footer) {
    return { ok: false, error: "Hiányzik a leiratkozási lábléc: töltsd ki a beállításokban" };
  }

  const to = await resolveDraftRecipient(tenantId, row);
  if (!to) return { ok: false, error: "Ehhez a céghez nincs email cím" };

  if (await isAddressSuppressed(tenantId, to)) return { ok: false, error: SUPPRESSED_ERROR };

  // Fail closed: no signed unsubscribe link, no send. Before the claim so the row stays sendable.
  let headers: Record<string, string>;
  try {
    headers = unsubscribeHeaders(tenantId, to, row.id);
  } catch (err) {
    reportError("outreach.sendDraft.unsubscribeHeaders", err, { draftId: row.id });
    return { ok: false, error: "A leiratkozási link nem készíthető el (hiányzó kulcs), a levél nem ment el" };
  }

  return {
    ok: true,
    to,
    text: withFooter(row.body, footer),
    replyTo: typeof s.outreachReplyTo === "string" ? s.outreachReplyTo : null,
    headers,
  };
}

/** Everything after the claim: send, record, audit, advance the campaign member. The row is already `sending`. */
export async function deliverClaimedDraft(
  tenantId: number,
  row: EmailDraft,
  prep: Extract<Prepared, { ok: true }>,
  actor: { userId: number | null; appSlug?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const id = row.id;
  const ao = actor.userId != null ? undefined : { tenantId, actor: "agent" as const, actorAgentId: actor.appSlug ?? "app" };
  await audit(AUDIT_TYPE, id, "update", { status: row.status }, { status: "sending" }, ao);

  let result: Awaited<ReturnType<typeof sendEmail>>;
  try {
    result = await sendEmail({
      tenantId,
      to: prep.to,
      subject: row.subject,
      text: prep.text,
      replyTo: prep.replyTo,
      companyId: row.companyId,
      personId: row.personId,
      headers: prep.headers,
      idempotencyKey: draftSendKey(id, prep.to, row.subject, prep.text),
    });
  } catch (err) {
    // sendEmail catches its own transport errors, so reaching here means
    // something unexpected threw AFTER the claim. We cannot know whether the
    // mail went out, so the row stays `sending` - terminal, not re-sendable.
    reportError("outreach.sendDraft", err, { draftId: id, companyId: row.companyId });
    await db.emailDraft.update({
      where: { id },
      data: { lastError: "Ismeretlen hiba küldés közben: ellenőrizd a Resend naplót" },
    });
    return { ok: false, error: "Ismeretlen hiba küldés közben: ellenőrizd a Resend naplót" };
  }

  if (result.ok) {
    const sentAt = new Date();
    try {
      await db.$transaction(async (tx) => {
        await tx.emailDraft.update({
          where: { id },
          data: {
            status: "sent",
            sentAt,
            sentVia: "resend",
            toEmail: prep.to, // the address it actually went to; webhooks and replies match on it
            providerMessageId: result.id,
            threadKey: row.threadKey ?? threadKeyFor(row.campaign, row.companyId),
            lastError: result.warning ?? null,
          },
        });
        // Same cadence as a hand-sent touch (campaign tracking).
        await scheduleNextTouch(tx, row, sentAt);
      });
    } catch (err) {
      // The mail DID go out; only the bookkeeping failed. Leave the row in
      // `sending` (not re-sendable) with a note, same as the catch above.
      reportError("outreach.sendDraft.record", err, { draftId: id, companyId: row.companyId });
      await db.emailDraft.update({
        where: { id },
        data: { lastError: `Elküldve (${result.id}), de a rögzítés nem sikerült: ellenőrizd` },
      }).catch(() => {});
      return { ok: false, error: "Elküldve, de a rögzítés nem sikerült: ellenőrizd a Resend naplót" };
    }
    await audit(AUDIT_TYPE, id, "update", { status: row.status }, { status: "sent", providerMessageId: result.id }, ao);
    // A campaign e-mail step's draft went out: its member moves on in the sequence (item 4).
    await advanceOnSent({ tenantId, userId: actor.userId, appSlug: actor.appSlug }, row.campaign, row.companyId, row.step)
      .catch((err) => reportError("outreach.sendDraft.campaignAdvance", err, { draftId: id }));
    return { ok: true };
  }

  await db.emailDraft.update({ where: { id }, data: { status: "failed", lastError: result.error } });
  await audit(AUDIT_TYPE, id, "update", { status: "sending" }, { status: "failed", lastError: result.error }, ao);
  return { ok: false, error: result.error };
}
