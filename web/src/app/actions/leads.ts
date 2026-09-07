"use server";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { DEFAULT_LEAD_STATUSES, STAGE_DESCRIPTION_PLACEHOLDER, STAGE_DESCRIPTION_MAX } from "@/lib/leads/statuses";
import {
  changeLeadStatus, setLeadOutcome, assignLead, logLeadCallOutcome, setLeadQualification,
} from "@/lib/leads/service";
import type { LeadOutcome } from "@/lib/leads/outcomes";
import { userLeadCtx } from "@/lib/actor";
import { parseQuestionLines } from "@/lib/leads/qualification";
import { getLeadStatuses } from "@/lib/leads/queries";
import { deleteCompany } from "@/app/actions/companies";
import { deletePerson } from "@/app/actions/persons";

const TENANT_ID = 1;

export async function deleteLead(
  id: number,
  // Optional cascade: also soft-delete the linked company / person. Both are
  // recoverable (deletedAt + restore), so this stays non-destructive.
  cascade?: { company?: boolean; person?: boolean },
) {
  const lead = await db.lead.findFirst({
    where: { id, tenantId: TENANT_ID },
    select: {
      subject: true, serviceInterest: true, status: true,
      companyId: true, contact: { select: { personId: true } },
    },
  });
  if (!lead) return { error: "Lead nem található" };

  // Leads are thin process trackers — deleting one removes the tracker only;
  // the company, person/contact, interactions and any converted deal persist
  // unless the caller opts into the cascade below.
  await db.lead.deleteMany({ where: { id, tenantId: TENANT_ID } });
  await audit("lead", id, "delete",
    { subject: lead.subject, serviceInterest: lead.serviceInterest, status: lead.status }, null);

  if (cascade?.company && lead.companyId) await deleteCompany(lead.companyId);
  if (cascade?.person && lead.contact?.personId) await deletePerson(lead.contact.personId);

  revalidatePath("/leads");
  return { success: true };
}

export async function moveLead(leadId: number, newStatus: string) {
  const ctx = await userLeadCtx(TENANT_ID);
  if ("error" in ctx) return ctx;
  const res = await changeLeadStatus(leadId, newStatus, ctx);
  if ("error" in res) return res;
  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
  // Moving the card completes the lead's open callback task (changeLeadStatus →
  // completeOpenLeadCallTasks), so the task surfaces are stale too.
  revalidatePath("/tasks");
  return { success: true };
}

export async function updateLeadStatus(leadId: number, newStatus: string) {
  return moveLead(leadId, newStatus);
}

/** Lead → deal hand-off (the `won` door). Logic lives in lib/leads/service.ts. */
export async function convertLeadToDeal(leadId: number) {
  const ctx = await userLeadCtx(TENANT_ID);
  if ("error" in ctx) return ctx;
  const res = await setLeadOutcome(leadId, "won", ctx);
  if ("error" in res) return res;
  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/deals");
  return { success: true, dealId: res.dealId };
}

/** open | won | lost from the card / detail dropdown. */
export async function setLeadOutcomeAction(leadId: number, outcome: LeadOutcome, lostReason?: string | null) {
  const ctx = await userLeadCtx(TENANT_ID);
  if ("error" in ctx) return ctx;
  const res = await setLeadOutcome(leadId, outcome, ctx, lostReason);
  if ("error" in res) return res;
  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
  if (outcome === "won") revalidatePath("/deals");
  return { success: true, dealId: res.dealId };
}

export async function assignLeadAction(leadId: number, assignedToId: number | null) {
  const ctx = await userLeadCtx(TENANT_ID);
  if ("error" in ctx) return ctx;
  const res = await assignLead(leadId, assignedToId, ctx);
  if ("error" in res) return res;
  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
  return { success: true };
}

/**
 * "Hívás eredménye" — the UI adapter over the shared logLeadCallOutcome. The
 * note-required / callback rules are validated in the service, not here.
 */
export async function logLeadCall(leadId: number, input: {
  outcome: string; note: string; callbackAt?: string | null; demoWith?: string | null;
  lostReason?: string | null;
}) {
  const ctx = await userLeadCtx(TENANT_ID);
  if ("error" in ctx) return ctx;
  const res = await logLeadCallOutcome(
    leadId,
    {
      outcome: input.outcome,
      note: input.note,
      ...(input.callbackAt ? { callbackAt: input.callbackAt } : {}),
      ...(input.demoWith ? { demoWith: input.demoWith } : {}),
      ...(input.lostReason ? { lostReason: input.lostReason } : {}),
    },
    ctx,
  );
  if ("error" in res) return { error: res.error };
  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/tasks");
  return res;
}

/**
 * Edit a lead's own (process-tracker) fields. Company/person *content* lives on
 * their entity pages; here we only edit fields that belong to the lead itself,
 * plus company *reassignment* (fixing a mis-attached inbound lead). A lead must
 * always keep a company so it can still be converted, so clearing it is rejected.
 */
export async function updateLead(id: number, formData: FormData) {
  const before = await db.lead.findFirst({
    where: { id, tenantId: TENANT_ID },
    select: {
      subject: true, serviceInterest: true, source: true,
      estimatedValue: true, message: true, lostReason: true, companyId: true, outcome: true,
    },
  });
  if (!before) return { error: "Lead nem található" };

  // Absent key → field not submitted, leave unchanged. Empty string → clear to null.
  const text = (k: string): string | null | undefined => {
    const v = formData.get(k);
    if (v === null) return undefined;
    const s = String(v).trim();
    return s === "" ? null : s;
  };

  const subject = text("subject");
  const serviceInterest = text("serviceInterest");
  const source = text("source");
  const message = text("message");
  const lostReason = text("lostReason");
  // Editing must not be a back door around the mandatory-reason rule: a lost lead
  // keeps a reason (setLeadOutcome enforces it on the way in).
  if (before.outcome === "lost" && lostReason === null) {
    return { error: "A vesztett kimenetelhez indok kötelező" };
  }

  let estimatedValue: number | null | undefined = undefined;
  const valueRaw = formData.get("estimatedValue");
  if (valueRaw !== null) {
    const s = String(valueRaw).trim();
    if (s === "") estimatedValue = null;
    else {
      const n = Number(s);
      if (!Number.isFinite(n) || n < 0) return { error: "A becsült érték érvénytelen" };
      estimatedValue = n;
    }
  }

  let companyId: number | undefined = undefined;
  const companyIdRaw = formData.get("companyId");
  if (companyIdRaw !== null) {
    const s = String(companyIdRaw).trim();
    if (s === "") return { error: "A leadhez tartoznia kell cégnek" };
    const parsed = parseInt(s, 10);
    if (!Number.isInteger(parsed)) return { error: "Érvénytelen cég" };
    if (parsed !== before.companyId) {
      const company = await db.company.findFirst({
        where: { id: parsed, tenantId: TENANT_ID }, select: { id: true },
      });
      if (!company) return { error: "Cég nem található" };
    }
    companyId = parsed;
  }

  await db.lead.updateMany({
    where: { id, tenantId: TENANT_ID },
    data: {
      ...(subject !== undefined ? { subject } : {}),
      ...(serviceInterest !== undefined ? { serviceInterest } : {}),
      ...(source !== undefined ? { source } : {}),
      ...(message !== undefined ? { message } : {}),
      ...(lostReason !== undefined ? { lostReason } : {}),
      ...(estimatedValue !== undefined ? { estimatedValue } : {}),
      ...(companyId !== undefined ? { companyId } : {}),
    },
  });

  const beforeValue = before.estimatedValue != null ? Number(before.estimatedValue) : null;
  audit("lead", id, "update",
    {
      subject: before.subject, serviceInterest: before.serviceInterest, source: before.source,
      estimatedValue: beforeValue, message: before.message, lostReason: before.lostReason,
      companyId: before.companyId,
    },
    {
      subject: subject !== undefined ? subject : before.subject,
      serviceInterest: serviceInterest !== undefined ? serviceInterest : before.serviceInterest,
      source: source !== undefined ? source : before.source,
      estimatedValue: estimatedValue !== undefined ? estimatedValue : beforeValue,
      message: message !== undefined ? message : before.message,
      lostReason: lostReason !== undefined ? lostReason : before.lostReason,
      companyId: companyId !== undefined ? companyId : before.companyId,
    },
  );

  revalidatePath("/leads");
  revalidatePath(`/leads/${id}`);
  return { success: true };
}

// ── Lead status (pipeline column) management ───────────────────────

function slugifyStatusKey(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "") // strip combining accents (á→a, ő→o)
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 50) || "status"
  );
}

export async function createLeadStatus(formData: FormData) {
  const label = (formData.get("label") as string)?.trim();
  const color = (formData.get("color") as string) || "#6366f1";
  if (!label) return { error: "Név kötelező" };

  // Generate a unique slug key for this tenant.
  const base = slugifyStatusKey(label);
  let key = base;
  let n = 1;
  while (await db.leadStatus.findFirst({ where: { tenantId: TENANT_ID, key } })) {
    key = `${base}_${++n}`;
  }

  const max = await db.leadStatus.aggregate({
    where: { tenantId: TENANT_ID },
    _max: { position: true },
  });

  await db.leadStatus.create({
    data: {
      tenantId: TENANT_ID, key, label, color,
      position: (max._max.position ?? -1) + 1,
      isInitial: false, isTerminal: false, isCommitment: false,
      description: STAGE_DESCRIPTION_PLACEHOLDER,
    },
  });
  revalidatePath("/leads/setup");
  revalidatePath("/leads");
  return { success: true };
}

export async function upsertLeadStatus(formData: FormData) {
  const id = parseInt(formData.get("id") as string);
  const label = (formData.get("label") as string)?.trim();
  const color = (formData.get("color") as string) || "#6366f1";
  const isInitial = formData.get("isInitial") === "true";
  const isTerminal = formData.get("isTerminal") === "true";
  const isCommitment = formData.get("isCommitment") === "true";
  // Absent key → not submitted, leave unchanged. Empty string → clear to null.
  const descRaw = formData.get("description");
  const description = descRaw === null ? undefined : (String(descRaw).trim().slice(0, STAGE_DESCRIPTION_MAX) || null);
  if (!id) return { error: "Hiányzó azonosító" };
  if (!label) return { error: "Név kötelező" };

  const existing = await db.leadStatus.findFirst({ where: { id, tenantId: TENANT_ID } });
  if (!existing) return { error: "Státusz nem található" };
  // Same guard as deleteLeadStatus: the tenant must never end up with zero initial
  // statuses. Without this, un-checking the flag here silently leaves the board with
  // no entry column, so leads with a null/deleted status stop rendering anywhere.
  if (existing.isInitial && !isInitial) {
    return { error: "A kezdő státusz jelölése nem vehető le — előbb jelölj ki másikat." };
  }

  // Exactly one initial status and one commitment status (the megrendelés
  // column): clear the flag on the others when setting it here. A status can't
  // be both initial and terminal; the commitment point is mid-pipeline so it's
  // never terminal/initial.
  await db.$transaction([
    ...(isInitial
      ? [db.leadStatus.updateMany({ where: { tenantId: TENANT_ID, isInitial: true, NOT: { id } }, data: { isInitial: false } })]
      : []),
    ...(isCommitment
      ? [db.leadStatus.updateMany({ where: { tenantId: TENANT_ID, isCommitment: true, NOT: { id } }, data: { isCommitment: false } })]
      : []),
    db.leadStatus.update({
      where: { id },
      data: {
        label,
        color,
        isInitial,
        isTerminal: isInitial || isCommitment ? false : isTerminal,
        isCommitment: isInitial ? false : isCommitment,
        ...(description !== undefined ? { description } : {}),
      },
    }),
  ]);
  revalidatePath("/leads/setup");
  revalidatePath("/leads");
  return { success: true };
}

export async function deleteLeadStatus(id: number) {
  const status = await db.leadStatus.findFirst({ where: { id, tenantId: TENANT_ID } });
  if (!status) return { error: "Státusz nem található" };
  if (status.isInitial) return { error: "A kezdő státusz nem törölhető — előbb jelölj ki másikat." };

  const remaining = await db.leadStatus.count({ where: { tenantId: TENANT_ID } });
  if (remaining <= 1) return { error: "Legalább egy státusznak maradnia kell." };

  // Reassign any leads in this column to the initial status so none are orphaned.
  const initial = await db.leadStatus.findFirst({ where: { tenantId: TENANT_ID, isInitial: true } });
  const fallbackKey = initial?.key ?? "new";
  await db.lead.updateMany({
    where: { tenantId: TENANT_ID, status: status.key },
    data: { status: fallbackKey },
  });
  await db.leadStatus.delete({ where: { id } });
  revalidatePath("/leads/setup");
  revalidatePath("/leads");
  return { success: true };
}

export async function seedDefaultLeadStatuses() {
  const count = await db.leadStatus.count({ where: { tenantId: TENANT_ID } });
  if (count > 0) return { error: "Már léteznek státuszok" };
  await db.leadStatus.createMany({
    data: DEFAULT_LEAD_STATUSES.map((s) => ({ tenantId: TENANT_ID, ...s })),
  });
  revalidatePath("/leads/setup");
  revalidatePath("/leads");
  return { success: true };
}

export async function reorderLeadStatuses(orderedIds: number[]) {
  // All ids must belong to this tenant (app-level scoping is the only guard).
  const owned = await db.leadStatus.count({
    where: { tenantId: TENANT_ID, id: { in: orderedIds } },
  });
  if (owned !== orderedIds.length) return { error: "Érvénytelen sorrend" };

  await db.$transaction(
    orderedIds.map((id, index) =>
      db.leadStatus.updateMany({
        where: { id, tenantId: TENANT_ID },
        data: { position: index },
      }),
    ),
  );
  revalidatePath("/leads/setup");
  revalidatePath("/leads");
  return { success: true };
}


// ── Setter tab: qualification answers + the tenant's question list ──

/** Setter answers — the logic lives in the shared lib/leads/service.ts. */
export async function saveLeadQualification(leadId: number, answers: Record<string, string>) {
  const ctx = await userLeadCtx(TENANT_ID);
  if ("error" in ctx) return ctx;
  const res = await setLeadQualification(leadId, answers, ctx);
  if ("error" in res) return res;
  revalidatePath(`/leads/${leadId}`);
  return { success: true };
}

/**
 * Replace the tenant's setter question list (one `slug|label` per line) and the
 * intro-material link. Both live in tenants.settings, so they save together.
 */
export async function saveQualificationQuestions(text: string, introUrl?: string) {
  const parsed = parseQuestionLines(text);
  if ("error" in parsed) return parsed;

  const url = (introUrl ?? "").trim();
  // https-only, same rule as webhook_out: this link goes out in customer email.
  if (url && !/^https:\/\//i.test(url)) return { error: "A termékismertető linkje https:// címmel kezdődjön" };
  if (url.length > 500) return { error: "A link túl hosszú" };

  const before = await db.tenant.findUnique({ where: { id: TENANT_ID }, select: { settings: true } });
  const settings = {
    ...((before?.settings ?? {}) as Record<string, unknown>),
    qualificationQuestions: parsed,
    introMaterialUrl: url || null,
  };
  await db.tenant.update({
    where: { id: TENANT_ID },
    // Prisma's InputJsonValue rejects an interface without an index signature;
    // the value IS plain JSON, so the double cast is the whole story.
    data: { settings: settings as unknown as Prisma.InputJsonValue },
  });
  const beforeSettings = (before?.settings as Record<string, unknown> | null) ?? {};
  await audit("tenant", TENANT_ID, "update",
    {
      qualificationQuestions: beforeSettings.qualificationQuestions ?? null,
      introMaterialUrl: beforeSettings.introMaterialUrl ?? null,
    },
    { qualificationQuestions: parsed, introMaterialUrl: url || null });

  revalidatePath("/leads/setup");
  revalidatePath("/leads");
  return { success: true };
}

// ── Task → kanban: ticking a call task must never advance the stage silently ──

/**
 * What the "melyik fázisba kerüljön?" prompt needs, fetched lazily when the
 * modal opens (not on every task render). Returns null when the task is not a
 * lead call task — the caller then shows no prompt at all.
 */
export async function getLeadStagePrompt(taskId: number) {
  // Server actions are publicly callable by id — this one reads lead/contact
  // metadata, so it needs the same auth gate as every other lead action.
  const ctx = await userLeadCtx(TENANT_ID);
  if ("error" in ctx) return null;

  const task = await db.task.findFirst({
    where: { id: taskId, tenantId: TENANT_ID },
    select: { leadId: true, type: true },
  });
  if (!task?.leadId || task.type !== "call") return null;

  const lead = await db.lead.findFirst({
    where: { id: task.leadId, tenantId: TENANT_ID },
    select: {
      id: true, status: true, outcome: true, convertedDealId: true,
      company: { select: { name: true } },
      contact: { select: { person: { select: { firstName: true, lastName: true } } } },
    },
  });
  if (!lead) return null;
  // A closed lead has left the board; there is no stage to pick.
  if (lead.outcome !== "open" || lead.convertedDealId) return null;

  const p = lead.contact?.person;
  const who = p ? `${p.lastName ?? ""} ${p.firstName ?? ""}`.trim() : null;
  const statuses = await getLeadStatuses(TENANT_ID);
  return {
    leadId: lead.id,
    currentStatus: lead.status,
    title: [who, lead.company?.name].filter(Boolean).join(" · ") || `Lead #${lead.id}`,
    statuses: statuses.map((st) => ({ key: st.key, label: st.label, description: st.description })),
  };
}
