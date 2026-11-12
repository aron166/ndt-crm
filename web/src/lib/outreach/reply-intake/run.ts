import "server-only";
import { simpleParser } from "mailparser";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { reportError } from "@/lib/report-error";
import { applyOptOut } from "@/lib/outreach/unsubscribe";
import { recordDraftReply } from "@/lib/outreach/record-reply";
import { classifyMail, type Classified } from "./classify";

const ALREADY = "Erre a megkeresésre már rögzítettünk választ";
const FREE_MAIL = new Set([
  "gmail.com", "googlemail.com", "freemail.hu", "citromail.hu", "outlook.com", "hotmail.com", "live.com",
  "yahoo.com", "icloud.com", "t-online.hu", "invitel.hu", "vipmail.hu", "indamail.hu",
]);
const bare = (id: string) => id.replace(/^<|>$/g, "").trim().toLowerCase();

/** The draft a reply belongs to: our Resend message id in the thread headers, else the address, else the company domain. */
async function matchDraft(tenantId: number, from: string, inReplyTo: string[]): Promise<{ id: number; status?: string } | null> {
  const ids = inReplyTo.map(bare);
  if (ids.length) {
    const rows = await db.$queryRaw<{ id: number; status: string }[]>`
      SELECT d.id, d.status FROM email_provider_events e JOIN email_drafts d ON d.id = e.draft_id
      WHERE e.tenant_id = ${tenantId} AND e.provider = 'resend'
        AND lower(trim(both '<>' from e.payload->'data'->>'message_id')) = ANY(${ids}::text[])
      ORDER BY e.id DESC LIMIT 1`;
    if (rows[0]) return rows[0];
  }
  const where = { tenantId, status: { in: ["sent", "replied"] } };
  const sel = { id: true, status: true } as const;
  const orderBy = { sentAt: "desc" } as const;
  const byAddress = await db.emailDraft.findFirst({ where: { ...where, toEmail: { equals: from, mode: "insensitive" } }, orderBy, select: sel });
  if (byAddress) return byAddress;
  const domain = from.split("@")[1] ?? "";
  if (!domain || FREE_MAIL.has(domain)) return null;
  return db.emailDraft.findFirst({ where: { ...where, toEmail: { endsWith: "@" + domain, mode: "insensitive" } }, orderBy, select: sel });
}

type Outcome = "replies" | "optOuts" | "bounces" | "autos" | "unmatched" | "ignored";

async function applyEffects(tenantId: number, c: Classified): Promise<{ outcome: Outcome; draftId?: number }> {
  switch (c.kind) {
    case "bounce":
      if (c.recipient) await applyOptOut(tenantId, c.recipient, { kind: "bounce", source: "imap_bounce", agent: "reply-intake" });
      return { outcome: "bounces" };
    case "opt_out": {
      // Only someone we mailed: an opt-out word from a stranger suppresses nobody.
      const draft = await matchDraft(tenantId, c.from, c.inReplyTo);
      if (!draft) return { outcome: "unmatched" };
      await applyOptOut(tenantId, c.from, { kind: "unsubscribe", source: "imap_reply", agent: "reply-intake", draftId: draft.id });
      return { outcome: "optOuts", draftId: draft.id };
    }
    case "auto": return { outcome: "autos" };
    case "ignore": return { outcome: "ignored" };
    case "reply": {
      const draft = await matchDraft(tenantId, c.from, c.inReplyTo);
      if (!draft) return { outcome: "unmatched" };
      if (draft.status !== "replied") {
        const res = await recordDraftReply(tenantId, { draftId: draft.id, replyType: null, note: c.snippet || undefined, appSlug: "reply-intake" });
        if (!res.ok && res.error !== ALREADY) throw new Error(res.error);
      }
      return { outcome: "replies", draftId: draft.id };
    }
  }
}

export async function runReplyIntake(
  tenantId: number,
  messages: AsyncIterable<Buffer> | Iterable<Buffer>,
  now = new Date(),
  ourDomains: string[] = [],
) {
  const out = { ok: true as const, seen: 0, new: 0, replies: 0, optOuts: 0, bounces: 0, autos: 0, unmatched: 0, ignored: 0 };
  for await (const raw of messages) {
    try {
      const parsed = await simpleParser(raw);
      const c = classifyMail(parsed, raw, ourDomains);
      const subject = parsed.subject ?? null;
      const data = {
        tenantId, provider: "imap", eventId: c.messageId, eventType: "imap." + c.kind,
        email: c.kind === "bounce" ? c.recipient : "from" in c ? c.from : null,
        payload: {
          kind: c.kind, from: "from" in c ? c.from : null, subject,
          inReplyTo: c.kind === "reply" ? c.inReplyTo : [], snippet: c.kind === "reply" ? c.snippet : null,
        } as Prisma.InputJsonValue,
      };
      let rowId: number;
      try {
        rowId = (await db.emailProviderEvent.create({ data })).id;
      } catch (err) {
        if ((err as { code?: string }).code !== "P2002") throw err;
        const row = await db.emailProviderEvent.findUnique({ where: { provider_eventId: { provider: "imap", eventId: c.messageId } }, select: { id: true, processedAt: true } });
        if (!row) throw err;
        if (row.processedAt) { out.seen++; continue; }
        rowId = row.id; // an earlier poll died before the effects finished: redo them
      }
      const { outcome, draftId } = await applyEffects(tenantId, c);
      await db.emailProviderEvent.update({ where: { id: rowId }, data: { processedAt: now, ...(draftId ? { draftId } : {}) } });
      out.new++;
      out[outcome]++;
    } catch (err) {
      reportError("reply-intake.message", err, { tenantId });
    }
  }
  return out;
}

/** Atomic: touches only this key, so a concurrent write to another settings key is never lost. */
export async function markInboxChecked(tenantId: number, now = new Date()): Promise<void> {
  const iso = now.toISOString();
  await db.$executeRaw`UPDATE tenants SET settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{inboxCheckedAt}', to_jsonb(${iso}::text)) WHERE id = ${tenantId}`;
}
