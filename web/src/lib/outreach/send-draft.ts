import "server-only";
import type { EmailDraft } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { reportError } from "@/lib/report-error";
import { gateDraft } from "@/lib/outreach/template";
import { advanceOnSent, campaignSendBlock } from "@/lib/campaigns/service";
import { sendEmail } from "@/lib/integrations/resend";
import { sendViaMailbox, type MailboxConfig } from "@/lib/integrations/mailbox";
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
export async function prepareDraftSend(tenantId: number, row: EmailDraft, via: "resend" | "mailbox" = "resend"): Promise<Prepared> {
  // §6b: same template gate as the copy and the manual-send paths.
  const gate = await gateDraft(tenantId, row.campaign, row.step);
  if (!gate.ok) return { ok: false, error: gate.error };
  const blocked = await campaignSendBlock(tenantId, row.campaign, via);
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
  /** The Workspace mailbox route (scheduler only, 2026-11-18); omitted = Resend. */
  mailbox?: { cfg: MailboxConfig; fromName: string | null },
): Promise<{ ok: true } | { ok: false; error: string; auth?: boolean }> {
  const id = row.id;
  const ao = actor.userId != null ? undefined : { tenantId, actor: "agent" as const, actorAgentId: actor.appSlug ?? "app" };
  await audit(AUDIT_TYPE, id, "update", { status: row.status }, { status: "sending" }, ao);

  const via = mailbox ? "mailbox" : "resend";
  const unknownErr = "Ismeretlen hiba küldés közben: ellenőrizd " + (mailbox ? "a postafiók Elküldött mappáját" : "a Resend naplót");
  let result: Awaited<ReturnType<typeof sendEmail>> | Awaited<ReturnType<typeof sendViaMailbox>>;
  try {
    result = mailbox ? await sendViaMailbox(mailbox.cfg, {
      tenantId,
      to: prep.to,
      subject: row.subject,
      text: prep.text,
      replyTo: prep.replyTo,
      fromName: mailbox.fromName,
      companyId: row.companyId,
      personId: row.personId,
      headers: prep.headers,
    }) : await sendEmail({
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
      data: { lastError: unknownErr },
    });
    return { ok: false, error: unknownErr };
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
            sentVia: via,
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
      return { ok: false, error: "Elküldve, de a rögzítés nem sikerült: ellenőrizd " + (mailbox ? "a postafiók Elküldött mappáját" : "a Resend naplót") };
    }
    await audit(AUDIT_TYPE, id, "update", { status: row.status }, { status: "sent", providerMessageId: result.id }, ao);
    // A campaign e-mail step's draft went out: its member moves on in the sequence (item 4).
    await advanceOnSent({ tenantId, userId: actor.userId, appSlug: actor.appSlug }, row.campaign, row.companyId, row.step)
      .catch((err) => reportError("outreach.sendDraft.campaignAdvance", err, { draftId: id }));
    return { ok: true };
  }

  if ("auth" in result && result.auth) {
    // The mailbox refused the login: nothing left, so the draft goes back to approved, not failed or sent (the caller pauses).
    await db.emailDraft.update({ where: { id }, data: { status: "approved", sentVia: null, lastError: result.error } });
    await audit(AUDIT_TYPE, id, "update", { status: "sending" }, { status: "approved", lastError: result.error }, ao);
    return { ok: false, error: result.error, auth: true };
  }
  if ("uncertain" in result && result.uncertain) {
    // The connection died after the data went over: we cannot know whether the mail left, so the
    // row stays `sending` - terminal, not re-sendable by hand (a retry could double-send).
    await db.emailDraft.update({ where: { id }, data: { lastError: result.error } });
    await audit(AUDIT_TYPE, id, "update", { status: "sending" }, { status: "sending", lastError: result.error }, ao);
    return { ok: false, error: result.error };
  }
  await db.emailDraft.update({ where: { id }, data: { status: "failed", lastError: result.error } });
  await audit(AUDIT_TYPE, id, "update", { status: "sending" }, { status: "failed", lastError: result.error }, ao);
  return { ok: false, error: result.error };
}

export const STUCK_AFTER_MS = 10 * 60_000;

/**
 * A human settles a draft left in `sending` (an uncertain send, Vanda #218 r2): "sent" after checking the Sent
 * folder records it like a delivered send (member advances, next touch scheduled), "not_sent" returns it to
 * approved. Only rows `sending` for over 10 minutes, so a send in flight is never touched. The caller checks the
 * operator role; this scopes by tenant and claims the row with one conditional update.
 */
export async function settleStuckDraft(
  tenantId: number,
  id: number,
  outcome: "sent" | "not_sent",
  actor: { userId: number },
  now: Date = new Date(),
): Promise<{ ok: true } | { ok: false; error: string }> {
  const row = await db.emailDraft.findFirst({ where: { id, tenantId } });
  if (!row) return { ok: false, error: "Piszkozat nem található" };
  const where = { id, tenantId, status: "sending", updatedAt: { lt: new Date(now.getTime() - STUCK_AFTER_MS) } };
  if (outcome === "not_sent") {
    const r = await db.emailDraft.updateMany({ where, data: { status: "approved", sentVia: null, lastError: "Kézzel visszaállítva: nem ment el" } });
    if (r.count === 0) return { ok: false, error: "Ez a piszkozat nem ragadt küldés alatt (vagy még 10 percen belül van)" };
    await audit(AUDIT_TYPE, id, "update", { status: "sending" }, { status: "approved", settledBy: actor.userId }, { tenantId });
    return { ok: true };
  }
  const sentAt = now;
  const done = await db.$transaction(async (tx) => {
    const r = await tx.emailDraft.updateMany({
      where,
      data: { status: "sent", sentAt, sentVia: row.sentVia ?? "manual", threadKey: row.threadKey ?? threadKeyFor(row.campaign, row.companyId), lastError: "Kézzel jelölve elküldöttnek (Elküldöttek mappa)" },
    });
    if (r.count === 0) return false;
    await scheduleNextTouch(tx, row, sentAt);
    return true;
  });
  if (!done) return { ok: false, error: "Ez a piszkozat nem ragadt küldés alatt (vagy még 10 percen belül van)" };
  await audit(AUDIT_TYPE, id, "update", { status: "sending" }, { status: "sent", settledBy: actor.userId }, { tenantId });
  await advanceOnSent({ tenantId, userId: actor.userId }, row.campaign, row.companyId, row.step)
    .catch((err) => reportError("outreach.settleStuck.campaignAdvance", err, { draftId: id }));
  return { ok: true };
}
