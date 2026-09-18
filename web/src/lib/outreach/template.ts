/**
 * §6b: the live content item that serves as the template for one cold-email
 * step. Kai's rule, 2026-09-18: "a draft whose template is not live cannot be
 * copied or marked sent", and "changing the template applies to drafts not yet
 * sent". Emission stays a human act; nothing here sends anything.
 *
 * The slot is keyed on the outreach campaign STRING, because that is what the
 * drafts, the leads, the interactions and the thread keys already key on.
 * Unifying that string with the `Campaign` row is a separate migration.
 */
import { db } from "@/lib/db";

export interface StepTemplate {
  itemId: number;
  title: string;
  status: string;
  /** Non-null only when the item is live: that is the version drafts may use. */
  liveVersionId: number | null;
}

/** The item sitting in a campaign+step slot, or null when the slot is empty. */
export async function templateForStep(
  tenantId: number,
  campaign: string,
  step: number,
): Promise<StepTemplate | null> {
  const row = await db.contentItem.findFirst({
    where: { tenantId, outreachCampaign: campaign, outreachStep: step },
    select: { id: true, title: true, status: true, liveVersionId: true },
  });
  return row ? toTemplate(row) : null;
}

/**
 * The ONE place the "live means usable" rule lives. A non-live item never hands
 * out a version id, whatever its liveVersionId column still says.
 */
function toTemplate(
  row: { id: number; title: string; status: string; liveVersionId: number | null },
): StepTemplate {
  return {
    itemId: row.id,
    title: row.title,
    status: row.status,
    liveVersionId: row.status === "live" ? row.liveVersionId : null,
  };
}

/** Every slot of one campaign, keyed by step. One query, not one per step. */
export async function templatesForCampaign(
  tenantId: number,
  campaign: string,
): Promise<Map<number, StepTemplate>> {
  return (await templatesForCampaigns(tenantId, [campaign])).get(campaign) ?? new Map();
}

/**
 * The slots of SEVERAL campaigns in ONE query. The draft queue can show rows
 * from many campaigns at once; one query per campaign was a loop waiting to
 * grow (Vanda, #105).
 */
export async function templatesForCampaigns(
  tenantId: number,
  campaigns: string[],
): Promise<Map<string, Map<number, StepTemplate>>> {
  const out = new Map<string, Map<number, StepTemplate>>();
  if (campaigns.length === 0) return out;
  const rows = await db.contentItem.findMany({
    where: { tenantId, outreachCampaign: { in: campaigns }, outreachStep: { not: null } },
    select: { id: true, title: true, status: true, liveVersionId: true, outreachCampaign: true, outreachStep: true },
  });
  for (const r of rows) {
    const key = r.outreachCampaign as string;
    const byStep = out.get(key) ?? new Map<number, StepTemplate>();
    byStep.set(r.outreachStep as number, toTemplate(r));
    out.set(key, byStep);
  }
  return out;
}

export type TemplateGate =
  | { ok: true; liveVersionId: number | null }
  | { ok: false; error: string };

/**
 * May this draft be copied or marked sent?
 *
 * An EMPTY slot passes. Round one of the outreach was drafted by hand before
 * templates existed, and blocking it would break work that is already running.
 * A slot that HAS an item but is not live fails: somebody put a template there
 * on purpose and it has not been approved yet.
 */
export function gateOn(template: StepTemplate | null): TemplateGate {
  if (!template) return { ok: true, liveVersionId: null };
  if (template.liveVersionId === null) {
    return { ok: false, error: `A sablon még nincs jóváhagyva: ${template.title}` };
  }
  return { ok: true, liveVersionId: template.liveVersionId };
}

/** Convenience: read the slot and gate in one call. */
export async function gateDraft(
  tenantId: number,
  campaign: string,
  step: number,
): Promise<TemplateGate> {
  return gateOn(await templateForStep(tenantId, campaign, step));
}

/**
 * Has the template moved on since this draft was built? Only meaningful for a
 * draft that has NOT been sent: history must never change under a sent row.
 * A draft with no recorded template version is "unknown", not stale.
 */
export function templateIsStale(
  draft: { templateVersionId: number | null; sentAt: Date | null },
  template: StepTemplate | null,
): boolean {
  if (draft.sentAt) return false;
  if (!template || template.liveVersionId === null) return false;
  if (draft.templateVersionId === null) return false;
  return draft.templateVersionId !== template.liveVersionId;
}

/**
 * Which template version a draft payload may claim. An app key supplies the id;
 * it is only stored when that version really belongs to the item sitting in
 * THIS campaign+step slot. Anything else is dropped to null rather than
 * trusted - the same treatment personId and senderUserId get.
 */
export function validTemplateVersion(
  claimed: number | null | undefined,
  allowed: Map<number, { campaign: string | null; step: number | null }>,
  campaign: string,
  step: number,
): number | null {
  if (claimed == null) return null;
  const slot = allowed.get(claimed);
  if (!slot) return null;
  return slot.campaign === campaign && slot.step === step ? claimed : null;
}
