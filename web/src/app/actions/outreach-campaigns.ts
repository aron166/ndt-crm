"use server";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { gateDraft } from "@/lib/outreach/template";
import { audit } from "@/lib/audit";
import { getActor, NOT_A_CRM_USER } from "@/lib/actor";
import { reportError } from "@/lib/report-error";
import { threadKeyFor, type DraftStatus } from "@/lib/outreach/drafts";
import { scheduleNextTouch } from "@/lib/outreach/schedule";
import { runAutomations } from "@/lib/automations/engine";
import {
  canMarkReplied, markRepliedSchema, markSentSchema, MANUAL_SENDABLE_STATUSES,
  buildFunnel, type CampaignFunnel, type ReplyType,
} from "@/lib/outreach/campaign";
import { ingestLead } from "@/lib/leads/ingest";
import { leadIntakeSchema } from "@/lib/leads/schema";

// Campaign tracking (Kai/Áron P0, 2026-09-17). Round one is sent BY HAND from
// Gmail; these actions are how the CRM is told. Every action checks the CRM
// user itself — the proxy's login redirect is not an authorization check.

const TENANT_ID = 1;
type Fail = { ok: false; error: string };

async function requireUser(): Promise<{ userId: number } | Fail> {
  const { userId } = await getActor(TENANT_ID);
  return userId == null ? { ok: false, error: NOT_A_CRM_USER } : { userId };
}

const auditOpts = { tenantId: TENANT_ID, actor: "user" as const };

/** The two senders (and anyone else who is a CRM user) for the sender pickers. */
export async function listSenders(): Promise<{ id: number; name: string }[]> {
  const me = await requireUser();
  if ("ok" in me) return [];
  return db.user.findMany({
    where: { tenantId: TENANT_ID, passwordHash: "supabase-auth" },
    select: { id: true, name: true },
    orderBy: { id: "asc" },
  });
}

/**
 * Assign sender (whose Gmail) and/or wave to every touch of one company in one
 * campaign. Sent rows keep their sender — history is not rewritten.
 */
export async function setCampaignTarget(input: {
  campaign: string; companyId: number; senderUserId?: number | null; wave?: number | null;
}): Promise<{ ok: true; count: number } | Fail> {
  const me = await requireUser();
  if ("ok" in me) return me;
  const parsed = z.object({
    campaign: z.string().trim().min(1).max(80),
    companyId: z.number().int().positive(),
    senderUserId: z.number().int().positive().nullable().optional(),
    wave: z.number().int().min(1).max(52).nullable().optional(),
  }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Érvénytelen adat" };
  const { campaign, companyId, senderUserId, wave } = parsed.data;

  if (senderUserId != null) {
    const u = await db.user.findFirst({ where: { id: senderUserId, tenantId: TENANT_ID }, select: { id: true } });
    if (!u) return { ok: false, error: "Felhasználó nem található" };
  }
  const data: { senderUserId?: number | null; wave?: number | null } = {};
  if (senderUserId !== undefined) data.senderUserId = senderUserId;
  if (wave !== undefined) data.wave = wave;
  if (Object.keys(data).length === 0) return { ok: true, count: 0 };

  const where = { tenantId: TENANT_ID, campaign, companyId, status: { in: ["draft", "approved", "failed"] } };
  const rows = await db.emailDraft.findMany({ where, select: { id: true, senderUserId: true, wave: true } });
  if (rows.length === 0) return { ok: true, count: 0 };
  await db.emailDraft.updateMany({ where: { ...where, id: { in: rows.map((r) => r.id) } }, data });
  for (const r of rows) {
    audit("email_draft", r.id, "update", { senderUserId: r.senderUserId, wave: r.wave }, data, auditOpts);
  }
  revalidatePath("/outreach");
  return { ok: true, count: rows.length };
}

/**
 * "Kézzel elküldve": the touch left a Gmail inbox. Claims the row with one
 * conditional UPDATE (same guard as sendDraft — a double click finds nothing
 * left to claim), logs the outbound email Interaction, stamps the thread key the
 * reply intake matches on, and schedules the next touch.
 */
export async function markDraftSentManually(
  input: z.input<typeof markSentSchema>,
): Promise<{ ok: true; nextDueAt: string | null } | Fail> {
  const me = await requireUser();
  if ("ok" in me) return me;
  const parsed = markSentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Érvénytelen adat" };
  const { draftId, externalThreadId } = parsed.data;

  const row = await db.emailDraft.findFirst({ where: { id: draftId, tenantId: TENANT_ID } });
  if (!row) return { ok: false, error: "Piszkozat nem található" };
  if (!MANUAL_SENDABLE_STATUSES.includes(row.status as DraftStatus)) {
    return { ok: false, error: "Előbb hagyd jóvá, vagy ez az érintés már elment" };
  }

  // §6b: a step whose template exists but is not approved cannot be booked as
  // sent, the same gate the copy button and the Resend path use.
  const gate = await gateDraft(TENANT_ID, row.campaign, row.step);
  if (!gate.ok) return { ok: false, error: gate.error };

  // Same rule as the Resend path: no unsubscribe line, no cold email. The copy
  // button appends it; this refuses to book a send while none is configured.
  const tenant = await db.tenant.findUnique({ where: { id: TENANT_ID }, select: { settings: true } });
  const footer = (tenant?.settings as Record<string, unknown> | null)?.outreachFooter;
  if (typeof footer !== "string" || !footer.trim()) {
    return { ok: false, error: "Hiányzik a leiratkozási lábléc: töltsd ki a beállításokban" };
  }

  const now = new Date();
  const lead = await db.lead.findFirst({
    where: { tenantId: TENANT_ID, companyId: row.companyId, campaign: row.campaign },
    select: { id: true },
  });

  const nextDueAt = await db.$transaction(async (tx) => {
    const claim = await tx.emailDraft.updateMany({
      where: { id: draftId, tenantId: TENANT_ID, status: { in: MANUAL_SENDABLE_STATUSES } },
      data: {
        status: "sent", sentAt: now, sentVia: "manual",
        senderUserId: row.senderUserId ?? me.userId,
        threadKey: row.threadKey ?? threadKeyFor(row.campaign, row.companyId),
        ...(externalThreadId ? { externalThreadId } : {}),
        lastError: null,
      },
    });
    if (claim.count === 0) return undefined;

    await tx.interaction.create({
      data: {
        tenantId: TENANT_ID, companyId: row.companyId, personId: row.personId, leadId: lead?.id ?? null,
        userId: row.senderUserId ?? me.userId,
        type: "email", direction: "outbound", outcome: "sent",
        notes: `${row.subject}\n\n(${row.campaign} · ${row.step}. érintés · kézzel, Gmail)`,
        occurredAt: now, campaign: row.campaign,
      },
    });
    await tx.company.updateMany({
      where: { id: row.companyId, tenantId: TENANT_ID },
      data: { lastInteractionDate: now },
    });

    return scheduleNextTouch(tx, row, now);
  });
  if (nextDueAt === undefined) {
    revalidatePath("/outreach");
    return { ok: false, error: "Ez az érintés már el lett könyvelve" };
  }

  audit("email_draft", draftId, "update", { status: row.status },
    { status: "sent", sentVia: "manual", externalThreadId: externalThreadId ?? null, nextDueAt: nextDueAt?.toISOString() ?? null },
    auditOpts);
  revalidatePath("/outreach");
  return { ok: true, nextDueAt: nextDueAt?.toISOString() ?? null };
}

/**
 * "Válasz jött": the prospect answered a hand-sent touch. Goes through the SAME
 * reply intake as the API (ingestLead with the draft key): one lead per thread,
 * the draft flips to `replied`, the remaining touches are cancelled.
 */
export async function markDraftReplied(
  input: { draftId: number; replyType: ReplyType; note?: string },
): Promise<{ ok: true; leadId: number; deduped: boolean } | Fail> {
  const me = await requireUser();
  if ("ok" in me) return me;
  const parsed = markRepliedSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Érvénytelen adat" };
  const { draftId, replyType, note } = parsed.data;

  const row = await db.emailDraft.findFirst({
    where: { id: draftId, tenantId: TENANT_ID },
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
    where: { tenantId: TENANT_ID, companyId: row.companyId, campaign: row.campaign, status: "replied" },
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
    reply_type: replyType,
  });
  if (!intake.success) return { ok: false, error: "Érvénytelen adat a lead létrehozásához" };

  try {
    const res = await db.$transaction((tx) =>
      ingestLead(intake.data, { tenantId: TENANT_ID, appSlug: "crm-ui", draftId }, tx),
    );
    if (!res.deduped) {
      audit("email_draft", draftId, "update", { status: row.status }, { status: "replied", replyType, leadId: res.leadId }, auditOpts);
      // Same post-commit step as POST /api/leads: the follow-up task rules.
      await runAutomations({
        type: "lead_created",
        tenantId: TENANT_ID,
        leadId: res.leadId,
        companyId: res.companyId,
        personId: res.personId,
        companyName: row.company.name,
        fields: {
          company: row.company.name, source: "cold_email_reply", channel: "cold_email",
          campaign: row.campaign, serviceInterest: null, message: note ?? null,
          sourceApp: "crm-ui", tier: res.tier, replyType,
        },
      });
    }
    revalidatePath("/outreach");
    revalidatePath("/leads");
    return { ok: true, leadId: res.leadId, deduped: res.deduped };
  } catch (err) {
    reportError("outreach.markDraftReplied", err, { draftId });
    return { ok: false, error: "A válasz rögzítése nem sikerült" };
  }
}

export interface DueTouch {
  draftId: number;
  companyId: number;
  companyName: string;
  personName: string | null;
  toEmail: string | null;
  campaign: string;
  wave: number | null;
  step: number;
  subject: string;
  status: string;
  dueAt: string;
  senderUserId: number | null;
}

/**
 * Touches due by the end of today (overdue included), not yet sent. Replied /
 * cancelled rows never appear: a reply cancels the rest of the sequence.
 * A company that already answered is excluded even if a row escaped that.
 */
export async function getDueTouches(campaign?: string): Promise<DueTouch[]> {
  const me = await requireUser();
  if ("ok" in me) return [];
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  const rows = await db.emailDraft.findMany({
    where: {
      tenantId: TENANT_ID,
      status: { in: ["draft", "approved", "failed"] },
      dueAt: { lte: endOfToday },
      ...(campaign ? { campaign } : {}),
    },
    orderBy: [{ senderUserId: "asc" }, { dueAt: "asc" }, { step: "asc" }],
    select: {
      id: true, companyId: true, campaign: true, wave: true, step: true, subject: true,
      status: true, dueAt: true, senderUserId: true, toEmail: true,
      company: { select: { name: true } },
      person: { select: { firstName: true, lastName: true } },
    },
  });
  const answered = await db.emailDraft.findMany({
    where: {
      tenantId: TENANT_ID, status: "replied",
      companyId: { in: [...new Set(rows.map((r) => r.companyId))] },
    },
    select: { companyId: true, campaign: true },
  });
  const answeredKey = new Set(answered.map((a) => `${a.campaign}:${a.companyId}`));

  return rows
    .filter((r) => !answeredKey.has(`${r.campaign}:${r.companyId}`))
    .map((r) => ({
      draftId: r.id,
      companyId: r.companyId,
      companyName: r.company.name,
      personName: r.person ? `${r.person.lastName} ${r.person.firstName}`.trim() : null,
      toEmail: r.toEmail,
      campaign: r.campaign,
      wave: r.wave,
      step: r.step,
      subject: r.subject,
      status: r.status,
      dueAt: r.dueAt!.toISOString(),
      senderUserId: r.senderUserId,
    }));
}

/** Every campaign key the CRM has seen — drafts, leads and tagged interactions. */
export async function listCampaignKeys(): Promise<string[]> {
  const me = await requireUser();
  if ("ok" in me) return [];
  const [d, l, i] = await Promise.all([
    db.emailDraft.findMany({ where: { tenantId: TENANT_ID }, distinct: ["campaign"], select: { campaign: true } }),
    db.lead.findMany({ where: { tenantId: TENANT_ID, campaign: { not: null } }, distinct: ["campaign"], select: { campaign: true } }),
    db.interaction.findMany({ where: { tenantId: TENANT_ID, campaign: { not: null } }, distinct: ["campaign"], select: { campaign: true } }),
  ]);
  return [...new Set([...d, ...l, ...i].map((r) => r.campaign!).filter(Boolean))].sort();
}

export interface CampaignStats extends CampaignFunnel {
  campaign: string;
  waves: number[];
  targetsTotal: number;
}

/**
 * The dashboard. All numbers are computed from rows on every request.
 * Filters: sender = companies whose touches go from that inbox, OR (for the
 * non-email campaign) leads assigned to / interactions logged by that user.
 * Wave = companies in that wave (email campaigns only).
 */
export async function getCampaignStats(input: {
  campaign: string; senderUserId?: number | null; wave?: number | null;
}): Promise<CampaignStats | Fail> {
  const me = await requireUser();
  if ("ok" in me) return me;
  const parsed = z.object({
    campaign: z.string().trim().min(1).max(80),
    senderUserId: z.number().int().positive().nullable().optional(),
    wave: z.number().int().min(1).max(52).nullable().optional(),
  }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Érvénytelen adat" };
  const { campaign, senderUserId, wave } = parsed.data;

  const allDrafts = await db.emailDraft.findMany({
    where: { tenantId: TENANT_ID, campaign },
    select: { companyId: true, step: true, status: true, sentAt: true, replyType: true, senderUserId: true, wave: true },
  });
  const waves = [...new Set(allDrafts.map((d) => d.wave).filter((w): w is number => w != null))].sort((a, b) => a - b);

  const drafts = allDrafts.filter((d) =>
    (senderUserId == null || d.senderUserId === senderUserId) && (wave == null || d.wave === wave));
  const scoped = senderUserId != null || wave != null;
  const companyIds = [...new Set(drafts.map((d) => d.companyId))];

  // Scope leads/interactions to the filtered companies. The ownership fallback
  // (lead assignee / who logged the call) applies ONLY to a campaign with no
  // drafts at all — the phone-only one. ponytail: in an email campaign a lead or
  // call on a company with no draft counts in the unfiltered total only, so the
  // filtered views can add up to LESS than the total (never more).
  const phoneOnly = allDrafts.length === 0;
  const scope = !scoped
    ? {}
    : phoneOnly
      ? (senderUserId != null && wave == null ? { owner: senderUserId } : { none: true })
      : { companies: companyIds };
  const leadWhere: Prisma.LeadWhereInput = {
    tenantId: TENANT_ID, campaign,
    ...("companies" in scope ? { companyId: { in: scope.companies } } : {}),
    ...("owner" in scope ? { assignedToId: scope.owner } : {}),
    ...("none" in scope ? { id: -1 } : {}),
  };
  const interactionWhere: Prisma.InteractionWhereInput = {
    tenantId: TENANT_ID, campaign, type: { not: "email" },
    ...("companies" in scope ? { companyId: { in: scope.companies } } : {}),
    ...("owner" in scope ? { userId: scope.owner } : {}),
    ...("none" in scope ? { id: -1 } : {}),
  };
  const [leads, interactions] = await Promise.all([
    db.lead.findMany({ where: leadWhere, select: { tier: true, outcome: true } }),
    db.interaction.findMany({ where: interactionWhere, select: { type: true, outcome: true } }).then((rows) => rows.map((r) => ({ type: r.type ?? "", outcome: r.outcome }))),
  ]);

  return {
    campaign,
    waves,
    targetsTotal: companyIds.length,
    ...buildFunnel(drafts, leads, interactions),
  };
}
