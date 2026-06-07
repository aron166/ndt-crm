"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { leadStatusLabel, DEFAULT_LEAD_STATUSES } from "@/lib/leads/statuses";
import { getLeadStatuses } from "@/lib/leads/queries";

const TENANT_ID = 1;

export async function moveLead(leadId: number, newStatus: string) {
  const statuses = await getLeadStatuses(TENANT_ID);
  if (!statuses.some((s) => s.key === newStatus)) return { error: "Ismeretlen státusz" };

  const before = await db.lead.findFirst({
    where: { id: leadId, tenantId: TENANT_ID },
    select: { status: true },
  });
  if (!before) return { error: "Lead nem található" };

  await db.lead.updateMany({
    where: { id: leadId, tenantId: TENANT_ID },
    data: { status: newStatus },
  });

  audit("lead", leadId, "update",
    { status: before.status, statusLabel: leadStatusLabel(before.status, statuses) },
    { status: newStatus, statusLabel: leadStatusLabel(newStatus, statuses) },
  );
  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
  return { success: true };
}

export async function updateLeadStatus(leadId: number, newStatus: string) {
  return moveLead(leadId, newStatus);
}

/**
 * Convert a lead into a Deal in the default (first, non-archived) pipeline,
 * linked to the same company + person. Stamps the lead's convertedDealId/
 * convertedAt so it hands off to the deal pipeline (leaves the active leads
 * board, kept for history) and audits the hand-off.
 */
export async function convertLeadToDeal(leadId: number) {
  const lead = await db.lead.findFirst({
    where: { id: leadId, tenantId: TENANT_ID },
    include: {
      company: { select: { id: true, name: true } },
      contact: { select: { personId: true } },
    },
  });
  if (!lead) return { error: "Lead nem található" };
  if (!lead.companyId || !lead.company) return { error: "A leadhez nincs cég társítva" };

  const pipeline = await db.pipeline.findFirst({
    where: { tenantId: TENANT_ID, isArchived: false },
    orderBy: { position: "asc" },
    include: { stages: { orderBy: { position: "asc" }, take: 1 } },
  });
  if (!pipeline) return { error: "Nincs pipeline — hozz létre egyet előbb" };

  const firstStage = pipeline.stages[0];
  if (!firstStage) {
    return { error: "A pipeline-nak nincs egyetlen szakasza sem — előbb hozz létre egyet" };
  }

  // Snapshot the fields we need so TS narrowing survives the transaction closure.
  const companyId = lead.companyId;
  const companyName = lead.company.name;
  const personId = lead.contact?.personId ?? null;
  const title = lead.serviceInterest?.trim() || `${companyName} — érdeklődés`;
  const value = lead.estimatedValue ?? null;

  // Convert atomically in one transaction: create the deal, then claim the lead.
  // `convertedDealId` is the single source of truth for "this lead has graduated"
  // — the conditional updateMany is the race guard, so a double-click / second
  // tab that loses the race gets claim.count 0 and throws, rolling back the deal
  // we just created (no duplicate). Once set, the lead leaves the active leads
  // board; the deal is the process tracker from here on. The lead entity is kept
  // (origin/UTM history), linked to its deal, never duplicated across both boards.
  let dealId: number;
  try {
    dealId = await db.$transaction(async (tx) => {
      const maxPos = await tx.deal.aggregate({
        where: { tenantId: TENANT_ID, stageId: firstStage.id },
        _max: { position: true },
      });
      const deal = await tx.deal.create({
        data: {
          tenantId: TENANT_ID,
          title,
          companyId,
          personId,
          pipelineId: pipeline.id,
          stageId: firstStage.id,
          value,
          currency: "HUF",
          position: (maxPos._max.position ?? -1) + 1,
        },
        select: { id: true },
      });

      const claim = await tx.lead.updateMany({
        where: { id: leadId, tenantId: TENANT_ID, convertedDealId: null },
        data: { convertedDealId: deal.id, convertedAt: new Date() },
      });
      if (claim.count === 0) throw new Error("LEAD_ALREADY_CONVERTED");

      return deal.id;
    });
  } catch (e) {
    if (e instanceof Error && e.message === "LEAD_ALREADY_CONVERTED") {
      return { error: "A lead már át lett alakítva deallé" };
    }
    throw e;
  }

  audit("deal", dealId, "create", null, { title, fromLeadId: leadId });
  audit("lead", leadId, "update",
    { convertedDealId: null },
    { convertedDealId: dealId },
  );

  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/deals");
  return { success: true, dealId };
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
      isInitial: false, isTerminal: false,
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
  if (!id) return { error: "Hiányzó azonosító" };
  if (!label) return { error: "Név kötelező" };

  const existing = await db.leadStatus.findFirst({ where: { id, tenantId: TENANT_ID } });
  if (!existing) return { error: "Státusz nem található" };

  // Exactly one initial status: clear the flag on the others when setting it here.
  // A status can't be both initial and terminal.
  await db.$transaction([
    ...(isInitial
      ? [db.leadStatus.updateMany({ where: { tenantId: TENANT_ID, isInitial: true, NOT: { id } }, data: { isInitial: false } })]
      : []),
    db.leadStatus.update({
      where: { id },
      data: { label, color, isInitial, isTerminal: isInitial ? false : isTerminal },
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
