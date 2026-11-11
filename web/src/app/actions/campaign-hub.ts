"use server";
// Campaigns hub server actions: thin, session-scoped wrappers over lib/campaigns/service, the
// same functions the HTTP API calls (docs/api.md "Campaigns"). Role checks live in the service:
// approve and the outbound switch are Áron only, applying a load or an undo needs admin or manager.

import { revalidatePath } from "next/cache";
import { getActor, NOT_A_CRM_USER } from "@/lib/actor";
import * as svc from "@/lib/campaigns/service";
import { addMembersSchema } from "@/lib/campaigns/members";
import { createSchema, outcomeSchema, patchSchema, stepsSchema } from "@/lib/campaigns/api";
import { parseMemberFile } from "@/lib/campaigns/member-file";
import type { OutcomeKey } from "@/lib/campaigns/rules";

const TENANT_ID = 1;
type Err = { error: string };

const bad = (e: { issues: { message: string }[] }): Err => ({ error: e.issues[0]?.message ?? "Érvénytelen adat" });
function touch(slug?: string) {
  revalidatePath("/campaigns");
  if (slug) revalidatePath(`/campaigns/${slug}`);
}

export async function createCampaignAction(input: unknown): Promise<{ ok: true; slug: string } | Err> {
  const { userId } = await getActor(TENANT_ID);
  if (userId == null) return { error: NOT_A_CRM_USER };
  const p = createSchema.safeParse(input);
  if (!p.success) return bad(p.error);
  const r = await svc.createCampaign({ tenantId: TENANT_ID, userId }, p.data as Parameters<typeof svc.createCampaign>[1]);
  if ("error" in r) return { error: r.error };
  touch();
  return { ok: true, slug: r.slug };
}

export async function saveStepsAction(slug: string, steps: unknown): Promise<{ ok: true } | Err> {
  const { userId } = await getActor(TENANT_ID);
  if (userId == null) return { error: NOT_A_CRM_USER };
  const p = stepsSchema.safeParse(steps);
  if (!p.success) return bad(p.error);
  const r = await svc.setSteps({ tenantId: TENANT_ID, userId }, slug, p.data);
  if ("error" in r) return { error: r.error };
  touch(slug);
  return { ok: true };
}

export async function updateCampaignAction(slug: string, patch: unknown): Promise<{ ok: true } | Err> {
  const { userId } = await getActor(TENANT_ID);
  if (userId == null) return { error: NOT_A_CRM_USER };
  const p = patchSchema.safeParse(patch);
  if (!p.success) return bad(p.error);
  const r = await svc.updateCampaign({ tenantId: TENANT_ID, userId }, slug, p.data as Parameters<typeof svc.updateCampaign>[2]);
  if ("error" in r) return { error: r.error };
  touch(slug);
  return { ok: true };
}

/** Adopt the agent's proposed steps (the same write as PUT .../steps). The brief: updateCampaignAction({ adopt_brief_proposal: true }). */
export async function adoptProposedStepsAction(slug: string): Promise<{ ok: true } | Err> {
  const { userId } = await getActor(TENANT_ID);
  if (userId == null) return { error: NOT_A_CRM_USER };
  const c = await svc.getCampaign(TENANT_ID, slug);
  if (!c) return { error: "Kampány nem található" };
  const prop = c.briefProposal as { steps?: unknown; assets?: { item_id: number; step_position: number | null }[] } | null;
  const p = stepsSchema.safeParse(prop?.steps);
  if (!p.success || p.data.length === 0) return { error: "Nincs javasolt lépéslista" };
  // A proposed asset tied to a step position becomes that step's asset (still gated by approval at launch).
  const steps = p.data.map((st, i) => ({ ...st, content_item_id: st.content_item_id ?? prop?.assets?.find((a) => a.step_position === i + 1)?.item_id ?? null }));
  const r = await svc.setSteps({ tenantId: TENANT_ID, userId }, slug, steps);
  if ("error" in r) return { error: r.error };
  touch(slug);
  return { ok: true };
}

export type LoadResult =
  | { ok: true; dryRun: boolean; summary: NonNullable<Extract<Awaited<ReturnType<typeof svc.addMembers>>, { ok: true }>["summary"]>; added: number }
  | Err;

/** Dry run (any CRM user) or apply (admin or manager, enforced in the service) of a member-load file. */
export async function loadMembersAction(slug: string, input: { fileText: string; batch: string; dryRun: boolean }): Promise<LoadResult> {
  const { userId } = await getActor(TENANT_ID);
  if (userId == null) return { error: NOT_A_CRM_USER };
  const file = parseMemberFile(String(input?.fileText ?? ""));
  if ("error" in file) return file;
  if (file.rows.length > 1000) return { error: "Egyszerre legfeljebb 1000 sor tölthető be" };
  const p = addMembersSchema.safeParse({ dry_run: input.dryRun !== false, batch: input.batch, rows: file.rows });
  if (!p.success) return bad(p.error);
  const r = await svc.addMembers({ tenantId: TENANT_ID, userId }, slug, p.data);
  if ("error" in r) return { error: r.error };
  if (!p.data.dry_run) touch(slug);
  return { ok: true, dryRun: p.data.dry_run, summary: r.summary, added: "added" in r ? r.added : 0 };
}

export async function undoBatchAction(slug: string, batch: string, dryRun: boolean) {
  const { userId } = await getActor(TENANT_ID);
  if (userId == null) return { error: NOT_A_CRM_USER };
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(String(batch))) return { error: "Érvénytelen betöltés azonosító" };
  const r = await svc.undoBatch({ tenantId: TENANT_ID, userId }, slug, batch, dryRun !== false);
  if ("error" in r) return { error: r.error };
  if (dryRun === false) touch(slug);
  return { ok: true as const, summary: r.summary };
}

export async function approveCampaignAction(slug: string): Promise<{ ok: true } | Err> {
  const { userId } = await getActor(TENANT_ID);
  if (userId == null) return { error: NOT_A_CRM_USER };
  const r = await svc.approveCampaign({ tenantId: TENANT_ID, userId }, slug);
  if ("error" in r) return { error: r.error };
  touch(slug);
  revalidatePath("/calls");
  return { ok: true };
}

export async function setCampaignStatusAction(slug: string, to: "paused" | "stopped"): Promise<{ ok: true } | Err> {
  const { userId } = await getActor(TENANT_ID);
  if (userId == null) return { error: NOT_A_CRM_USER };
  if (to !== "paused" && to !== "stopped") return { error: "Ismeretlen állapot" };
  const r = await svc.setCampaignStatus({ tenantId: TENANT_ID, userId }, slug, to);
  if ("error" in r) return { error: r.error };
  touch(slug);
  return { ok: true };
}

export async function recordCampaignOutcomeAction(slug: string, input: unknown) {
  const { userId } = await getActor(TENANT_ID);
  if (userId == null) return { error: NOT_A_CRM_USER };
  const p = outcomeSchema.safeParse(input);
  if (!p.success) return bad(p.error);
  const r = await svc.recordOutcome({ tenantId: TENANT_ID, userId }, slug, { ...p.data, outcome: p.data.outcome as OutcomeKey });
  if ("error" in r) return { error: r.error };
  revalidatePath("/calls");
  return { ok: true as const, member: r.member, lead: r.lead };
}
