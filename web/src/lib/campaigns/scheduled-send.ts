import "server-only";
import type { EmailDraft } from "@prisma/client";
import { db } from "@/lib/db";
import { reportError } from "@/lib/report-error";
import { atLocal, localDay } from "@/lib/booking/time";
import { deliverClaimedDraft, prepareDraftSend, type Prepared } from "@/lib/outreach/send-draft";
import { MEMBER_KINDS, inWindow, type CampaignKind } from "./rules";
import { approvalHashNow, setCampaignStatus } from "./service";
import { bounceStopped, inboxFresh, inSendWindow, warmupCap } from "./schedule-gates";

// Sends the next due, already-approved draft of each campaign whose scheduled-sending switch is on.
// Every gate is enforced here, in code; a campaign that fails one reports a stable machine string in
// `blocked` and sends nothing. At most ONE send per campaign per call: the clock calls every few
// minutes, which spreads the sends. Docs: docs/api.md "Scheduled sending".

const MAILBOX_LOCK = 72120512; // pg_advisory_xact_lock(key1, tenantId): every campaign of the one sending mailbox serializes
const MAX_CANDIDATES = 5; // few: prepareDraftSend reads on its own connection while the lock is held (pool max 3, Vanda #200-5)
const SCHEDULER = { userId: null, appSlug: "scheduler" } as const;

type Result = { slug: string; sentDraftId: number | null; blocked: string[] };
const ymd = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const asRecord = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

export async function runScheduledSends(now = new Date(), opts: { tenantId?: number } = {}) {
  const tenantId = opts.tenantId ?? 1;
  const campaigns = await db.campaign.findMany({
    where: { tenantId, scheduledSending: true, status: "running", kind: { in: [...MEMBER_KINDS] as CampaignKind[] } },
    orderBy: { id: "asc" },
    select: {
      id: true, slug: true, dailyCap: true, senderUserId: true, startsOn: true, endsOn: true, approvedHash: true,
      outboundAutomations: true, audience: true,
      steps: { select: { position: true, channel: true, waitDays: true, audienceRule: true, contentItemId: true } },
    },
  });
  const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
  const ts = asRecord(tenant?.settings);
  const out: Result[] = [];
  for (const c of campaigns) {
    try {
      out.push(await runOne(tenantId, c, ts, now));
    } catch (err) {
      reportError("scheduledSend.campaign", err, { slug: c.slug });
      out.push({ slug: c.slug, sentDraftId: null, blocked: ["error"] });
    }
  }
  return { ok: true as const, campaigns: out };
}

async function runOne(
  tenantId: number,
  c: Parameters<typeof approvalHashNow>[1] & { slug: string; senderUserId: number | null; startsOn: Date | null; endsOn: Date | null; approvedHash: string | null },
  ts: Record<string, unknown>,
  now: Date,
): Promise<Result> {
  const blocked: string[] = [];
  const today = localDay(now);
  if (!inSendWindow(now)) blocked.push("outside_send_window");
  // shortcut: reason string outside the order's list; draftEmailStep stops outside the dates too.
  if (!inWindow(ymd(c.startsOn), ymd(c.endsOn), today.key)) blocked.push("outside_campaign_dates");
  if (c.approvedHash == null || c.approvedHash !== (await approvalHashNow(tenantId, c))) blocked.push("approval_changed");
  if (!str(ts.outreachFooter)) blocked.push("no_footer");
  if (!inboxFresh(typeof ts.inboxCheckedAt === "string" ? ts.inboxCheckedAt : null, now)) blocked.push("inbox_check_stale");

  const sender = c.senderUserId != null ? await db.user.findFirst({ where: { id: c.senderUserId, tenantId }, select: { id: true, name: true, settings: true } }) : null;
  const us = asRecord(sender?.settings);
  const startedOn = str(us.warmupStartedOn);
  if (!sender) blocked.push("sender_missing");
  else {
    if (!str(sender.name) || !str(us.phone)) blocked.push("sender_profile_incomplete");
    if (warmupCap(startedOn, today.key, 0) === 0) blocked.push("warmup_not_started");
  }

  // Campaign-wide, all time: a human must look before a bouncing campaign resumes.
  const [sent, bounced] = await Promise.all([
    db.emailDraft.count({ where: { tenantId, campaign: c.slug, sentVia: "resend", status: { in: ["sent", "replied"] } } }),
    db.campaignEvent.count({ where: { tenantId, campaignId: c.id, outcome: "bounce" } }),
  ]);
  // Provider failures: three failed drafts within the hour stop the queue instead of turning one approved draft
  // a tick into `failed` (Vanda #200-1). Real clock: updatedAt is written with it.
  const failing = await db.emailDraft.count({ where: { tenantId, campaign: c.slug, status: "failed", updatedAt: { gte: new Date(Date.now() - 60 * 60_000) } } });
  if (failing >= 3) {
    blocked.push("send_failing");
    await setCampaignStatus({ tenantId, ...SCHEDULER }, c.slug, "paused");
  }
  if (bounceStopped(sent, bounced)) {
    blocked.push("bounce_stop");
    await setCampaignStatus({ tenantId, ...SCHEDULER }, c.slug, "paused");
  }
  if (blocked.length || !sender) return { slug: c.slug, sentDraftId: null, blocked };

  const claimed = await db.$transaction(async (tx) => {
    // The warm-up protects the MAILBOX (the tenant's one Resend from-address), so every resend send counts: other
    // campaigns, other senders, hand-sent clicks.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${MAILBOX_LOCK}::int, ${tenantId}::int)`;
    const start = atLocal(today, 0);
    const sentToday = { tenantId, OR: [{ status: { in: ["sent", "replied"] }, sentAt: { gte: start } }, { status: "sending", updatedAt: { gte: start } }] };
    const [byMailbox, byCampaign, prior] = await Promise.all([
      tx.emailDraft.count({ where: { ...sentToday, OR: [{ status: { in: ["sent", "replied"] }, sentVia: "resend", sentAt: { gte: start } }, { status: "sending", updatedAt: { gte: start } }] } }),
      tx.emailDraft.count({ where: { ...sentToday, campaign: c.slug } }),
      tx.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(DISTINCT (sent_at AT TIME ZONE 'Europe/Budapest')::date) AS n FROM email_drafts
        WHERE tenant_id = ${tenantId} AND sent_via = 'resend' AND status IN ('sent', 'replied')
          AND sent_at < ${start} AND (sent_at AT TIME ZONE 'Europe/Budapest')::date >= ${startedOn}::date`,
    ]);
    const room = Math.min(warmupCap(startedOn, today.key, Number(prior[0]?.n ?? 0)) - byMailbox, c.dailyCap - byCampaign);
    if (room <= 0) return "cap_reached" as const;

    const drafts = await tx.emailDraft.findMany({ where: { tenantId, campaign: c.slug, status: "approved" }, orderBy: { id: "asc" }, take: MAX_CANDIDATES });
    const companyIds = [...new Set(drafts.map((d) => d.companyId))];
    const [members, replied] = await Promise.all([
      tx.campaignMember.findMany({ where: { tenantId, campaignId: c.id, companyId: { in: companyIds } }, select: { companyId: true, state: true, stepPosition: true } }),
      // A reply in ANY campaign ends cold e-mail to that company (Vanda #200-6).
      tx.emailDraft.findMany({ where: { tenantId, status: "replied", companyId: { in: companyIds } }, select: { companyId: true } }),
    ]);
    const repliedCo = new Set(replied.map((r) => r.companyId));
    const skip = (d: EmailDraft, why: string) => (d.lastError === why ? null : tx.emailDraft.update({ where: { id: d.id }, data: { lastError: why } }));
    for (const d of drafts) {
      const m = members.find((x) => x.companyId === d.companyId);
      const why = !m ? "Nincs kampánytag ehhez a céghez"
        : m.state !== "queued" || m.stepPosition !== d.step ? "A kampánytag már nem ezen a lépésen vár"
        : repliedCo.has(d.companyId) ? "A cég már válaszolt"
        : null;
      if (why) { await skip(d, why); continue; }
      const prep = await prepareDraftSend(tenantId, d);
      if (!prep.ok) { await skip(d, prep.error); continue; }
      const claim = await tx.emailDraft.updateMany({ where: { id: d.id, tenantId, status: "approved" }, data: { status: "sending", senderUserId: sender.id } });
      if (claim.count === 1) return { row: d, prep: prep as Extract<Prepared, { ok: true }> };
    }
    return null;
  }, { timeout: 30_000, maxWait: 10_000 });

  if (claimed === "cap_reached") return { slug: c.slug, sentDraftId: null, blocked: ["cap_reached"] };
  if (!claimed) return { slug: c.slug, sentDraftId: null, blocked: [] };
  const r = await deliverClaimedDraft(tenantId, claimed.row, claimed.prep, SCHEDULER);
  // shortcut: reason string outside the order's list; the failed draft needs a human.
  return r.ok ? { slug: c.slug, sentDraftId: claimed.row.id, blocked: [] } : { slug: c.slug, sentDraftId: null, blocked: ["send_failed"] };
}
