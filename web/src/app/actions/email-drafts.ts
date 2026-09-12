"use server";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { sendEmail } from "@/lib/integrations/resend";
import {
  type DraftStatus,
  isDraftStatus,
  isValidStep,
  canEdit,
  canApprove,
  canSend,
  threadKeyFor,
  withFooter,
} from "@/lib/outreach/drafts";

const TENANT_ID = 1;

// ponytail: "email_draft" isn't in lib/audit.ts's AuditEntityType union (out of
// scope for this task — audit.ts is owned by other in-flight work). "campaign"
// is the closest existing category for these campaign-scoped rows.
const AUDIT_TYPE = "campaign" as const;

export interface DraftRow {
  id: number;
  companyId: number;
  companyName: string;
  personId: number | null;
  personName: string | null;
  campaign: string;
  step: number;
  subject: string;
  body: string;
  toEmail: string | null;
  status: DraftStatus;
  threadKey: string | null;
  providerMessageId: string | null;
  lastError: string | null;
  sentAt: string | null;
  createdAt: string;
}

export interface DraftFilter {
  campaign?: string;
  step?: number;
  status?: string;
}

/** Drafts for the tenant, newest first, plus the distinct campaign list for the filter bar. */
export async function listDrafts(
  filter?: DraftFilter,
): Promise<{ drafts: DraftRow[]; campaigns: string[] }> {
  const where: Prisma.EmailDraftWhereInput = { tenantId: TENANT_ID };
  if (filter?.campaign) where.campaign = filter.campaign;
  if (filter?.step != null && isValidStep(filter.step)) where.step = filter.step;
  if (filter?.status && isDraftStatus(filter.status)) where.status = filter.status;

  const [rows, campaignRows] = await Promise.all([
    db.emailDraft.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true, companyId: true, personId: true, campaign: true, step: true,
        subject: true, body: true, toEmail: true, status: true, threadKey: true,
        providerMessageId: true, lastError: true, sentAt: true, createdAt: true,
        company: { select: { name: true } },
        person: { select: { firstName: true, lastName: true } },
      },
    }),
    db.emailDraft.findMany({
      where: { tenantId: TENANT_ID },
      select: { campaign: true },
      distinct: ["campaign"],
      orderBy: { campaign: "asc" },
    }),
  ]);

  return {
    drafts: rows.map((r) => ({
      id: r.id,
      companyId: r.companyId,
      companyName: r.company.name,
      personId: r.personId,
      personName: r.person ? `${r.person.lastName} ${r.person.firstName}`.trim() : null,
      campaign: r.campaign,
      step: r.step,
      subject: r.subject,
      body: r.body,
      toEmail: r.toEmail,
      status: r.status as DraftStatus,
      threadKey: r.threadKey,
      providerMessageId: r.providerMessageId,
      lastError: r.lastError,
      sentAt: r.sentAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
    campaigns: campaignRows.map((c) => c.campaign),
  };
}

export interface OutreachSettings {
  replyTo: string | null;
  footer: string | null;
}

/** tenants.settings.outreachReplyTo / outreachFooter. */
export async function getOutreachSettings(): Promise<OutreachSettings> {
  const tenant = await db.tenant.findUnique({ where: { id: TENANT_ID }, select: { settings: true } });
  const s = (tenant?.settings as Record<string, unknown> | null) ?? {};
  return {
    replyTo: typeof s.outreachReplyTo === "string" ? s.outreachReplyTo : null,
    footer: typeof s.outreachFooter === "string" ? s.outreachFooter : null,
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Read/merge/write tenants.settings — same pattern as
 * saveQualificationQuestions in actions/leads.ts. Never clobbers sibling keys
 * (qualificationQuestions, introMaterialUrl, …).
 */
export async function saveOutreachSettings(input: {
  replyTo: string;
  footer: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const replyTo = input.replyTo.trim();
  if (replyTo && !EMAIL_RE.test(replyTo)) return { ok: false, error: "Érvénytelen válaszcím" };
  const footer = input.footer.trim();

  const before = await db.tenant.findUnique({ where: { id: TENANT_ID }, select: { settings: true } });
  const beforeSettings = (before?.settings ?? {}) as Record<string, unknown>;
  const settings = {
    ...beforeSettings,
    outreachReplyTo: replyTo || null,
    outreachFooter: footer || null,
  };
  await db.tenant.update({
    where: { id: TENANT_ID },
    // Prisma's InputJsonValue rejects a plain Record without an index
    // signature — the value IS plain JSON, so the double cast is the whole story.
    data: { settings: settings as unknown as Prisma.InputJsonValue },
  });
  await audit(
    "tenant",
    TENANT_ID,
    "update",
    {
      outreachReplyTo: beforeSettings.outreachReplyTo ?? null,
      outreachFooter: beforeSettings.outreachFooter ?? null,
    },
    { outreachReplyTo: replyTo || null, outreachFooter: footer || null },
  );
  revalidatePath("/outreach");
  return { ok: true };
}

/** Edit a draft's subject/body — only while it's still editable. */
export async function updateDraft(
  id: number,
  input: { subject: string; body: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const row = await db.emailDraft.findFirst({ where: { id, tenantId: TENANT_ID } });
  if (!row) return { ok: false, error: "Piszkozat nem található" };
  if (!canEdit(row.status as DraftStatus)) {
    return { ok: false, error: "Ez a piszkozat már nem szerkeszthető" };
  }
  const subject = input.subject.trim();
  const body = input.body.trim();
  if (!subject) return { ok: false, error: "Hiányzó tárgy" };
  if (!body) return { ok: false, error: "Hiányzó szöveg" };

  await db.emailDraft.update({ where: { id }, data: { subject, body } });
  await audit(AUDIT_TYPE, id, "update", { subject: row.subject, body: row.body }, { subject, body });
  revalidatePath("/outreach");
  return { ok: true };
}

/** Approve a single draft. */
export async function approveDraft(id: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const row = await db.emailDraft.findFirst({ where: { id, tenantId: TENANT_ID } });
  if (!row) return { ok: false, error: "Piszkozat nem található" };
  if (!canApprove(row.status as DraftStatus)) {
    return { ok: false, error: "Ez a piszkozat nem jóváhagyható ebben az állapotban" };
  }
  await db.emailDraft.update({ where: { id }, data: { status: "approved" } });
  await audit(AUDIT_TYPE, id, "update", { status: row.status }, { status: "approved" });
  revalidatePath("/outreach");
  return { ok: true };
}

/** Approve every `draft`-status row in the given campaign (+ optional step). */
export async function approveAll(
  campaign: string,
  step?: number,
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const where: Prisma.EmailDraftWhereInput = {
    tenantId: TENANT_ID,
    campaign,
    status: "draft",
    ...(step != null && isValidStep(step) ? { step } : {}),
  };
  const rows = await db.emailDraft.findMany({ where, select: { id: true } });
  if (rows.length === 0) return { ok: true, count: 0 };

  await db.emailDraft.updateMany({ where, data: { status: "approved" } });
  for (const r of rows) {
    await audit(AUDIT_TYPE, r.id, "update", { status: "draft" }, { status: "approved" });
  }
  revalidatePath("/outreach");
  return { ok: true, count: rows.length };
}

/**
 * The only send path. One explicit human click per email — there is
 * deliberately no "send all" action.
 */
export async function sendDraft(id: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const row = await db.emailDraft.findFirst({ where: { id, tenantId: TENANT_ID } });
  if (!row) return { ok: false, error: "Piszkozat nem található" };
  if (!canSend(row.status as DraftStatus)) {
    return { ok: false, error: "Ez a piszkozat nem küldhető ebben az állapotban" };
  }

  // Resolve recipient: explicit toEmail, else the linked person, else the
  // company's first current contact.
  let to = row.toEmail?.trim() || null;
  if (!to && row.personId) {
    const person = await db.person.findFirst({ where: { id: row.personId }, select: { email: true } });
    to = person?.email?.trim() || null;
  }
  if (!to) {
    const contact = await db.contact.findFirst({
      where: { companyId: row.companyId, tenantId: TENANT_ID, endedAt: null },
      orderBy: [{ isPrimary: "desc" }, { startedAt: "desc" }],
      select: { email: true, person: { select: { email: true } } },
    });
    to = contact?.email?.trim() || contact?.person.email?.trim() || null;
  }
  if (!to) return { ok: false, error: "Nincs elérhető email cím a címzetthez" };

  const settings = await getOutreachSettings();
  const text = withFooter(row.body, settings.footer);

  const result = await sendEmail({
    tenantId: TENANT_ID,
    to,
    subject: row.subject,
    text,
    replyTo: settings.replyTo,
    companyId: row.companyId,
    personId: row.personId,
  });

  if (result.ok) {
    await db.emailDraft.update({
      where: { id },
      data: {
        status: "sent",
        sentAt: new Date(),
        providerMessageId: result.id,
        threadKey: row.threadKey ?? threadKeyFor(row.campaign, row.companyId),
        lastError: null,
      },
    });
    await audit(AUDIT_TYPE, id, "update", { status: row.status }, { status: "sent", providerMessageId: result.id });
    revalidatePath("/outreach");
    return { ok: true };
  }

  await db.emailDraft.update({ where: { id }, data: { status: "failed", lastError: result.error } });
  await audit(AUDIT_TYPE, id, "update", { status: row.status }, { status: "failed", lastError: result.error });
  revalidatePath("/outreach");
  return { ok: false, error: result.error };
}
