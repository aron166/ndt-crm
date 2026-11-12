// Campaigns slice 1: the DB side. Rules live in ./rules.ts (pure, tested); this file loads,
// checks tenant and permission, and writes. Every function takes the tenant from its ctx and
// scopes every query by it. Who may call what is decided here, not in the routes:
//   - approve: a session user who is Áron (tenants.settings.demoHosts.aron), never an app key;
//   - setSteps / updateCampaign / stop: a session user;
//   - everything else: a session user or an app key (agents), proposals and draft writes only.
// Nothing here sends a message, and nothing here creates an SLA task except the one the
// existing reply intake creates for a positive e-mail reply.

import { getLeadStatuses } from "@/lib/leads/queries";
import { OUTBOUND_ACTION_TYPES } from "@/lib/automations/types";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { AppKeyScope } from "@/lib/app-key-auth";
import { audit, type AuditOptions } from "@/lib/audit";
import { reportError } from "@/lib/report-error";
import { resolveDemoHost } from "@/lib/booking/queries";
import { addWorkingDays, atLocal, localDay } from "@/lib/booking/time";
import { companyKey, normalizeVat } from "@/lib/import/normalize";
import { normalizeEmail } from "@/lib/email";
import { loadSuppressionSet } from "@/lib/suppression";
import { isSuppressed } from "@/lib/suppression/match";
import { MAIN_STAGES } from "@/lib/leads/lifecycle";
import { startLeadLifecycle } from "@/lib/leads/lifecycle-sweep";
import { changeLeadStatus, completeOpenLeadCallTasks } from "@/lib/leads/service";
import { runAutomations } from "@/lib/automations/engine";
import { recomputeCloseness } from "@/lib/enrichment/recompute";
import { stopTouchesAfterReply } from "@/lib/outreach/stop-touches";
import { nextStatusFor, outcomeMeta } from "@/lib/outreach/queue";
import { createItem } from "@/lib/content/service";
import type { ContentCategory } from "@/lib/content/types";
import {
  approvalHash, canApprove, canSetStatus, inWindow, isForwardMove, planOutcome, selectDailyList, stepsFitKind,
  MEMBER_KINDS, type CampaignKind, type CampaignStatus, type OutcomeKey, type CallOutcomeKey, type StepDef, type StepChannel, scriptItemFor, campaignAutomationEvents, type StepCondition, audienceOf, type AudienceSource, OPEN_MEMBER_STATES, startFor } from "./rules";
import { closeSpecRequests } from "./spec-requests";
export { requestSpecification } from "./spec-requests";
import { planMembers, type MemberRow, type MembersPlan, reachFromContacts, isEmailAddress } from "./members";
import { campaignVariants, emailContext, memberAddress, valuesFor } from "./preview";
import { pickAsset, renderEmail, renderedText, segmentOf } from "./email-preview";

export interface CampaignCtx {
  tenantId: number;
  /** users.id of the session user; null for an app key. */
  userId: number | null;
  /** App slug when the caller is an app key. */
  appSlug?: string;
  /** App key scopes (null = legacy key). */
  scopes?: AppKeyScope[] | null;
}

export type Fail = { error: string; status: 400 | 403 | 404 | 409 };
const fail = (status: Fail["status"], error: string): Fail => ({ error, status });

function auditOpts(ctx: CampaignCtx): AuditOptions {
  return ctx.userId != null
    ? { tenantId: ctx.tenantId }
    : { tenantId: ctx.tenantId, actor: "agent", actorAgentId: ctx.appSlug ?? "app" };
}

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];
/** Row lock on the campaign: approve, member loads, step edits and undo serialize on it (Vanda #188-2). */
async function lockCampaign(tx: Tx, id: number): Promise<void> {
  await tx.$queryRaw`SELECT id FROM campaigns WHERE id = ${id} FOR UPDATE`;
}

const needsSession = (ctx: CampaignCtx): Fail | null =>
  ctx.userId == null ? fail(403, "Ehhez bejelentkezett CRM felhasználó kell, app kulcs nem elég") : null;

/** Áron's session: the only one that approves a launch or opens outbound automations. */
async function isAron(ctx: CampaignCtx): Promise<boolean> {
  if (ctx.userId == null) return false;
  const aron = await resolveDemoHost(ctx.tenantId, "aron");
  return aron != null && ctx.userId === aron;
}

/** Automation actions that reach outside the CRM (an e-mail, a webhook into n8n). */
export const OUTBOUND_ACTIONS = OUTBOUND_ACTION_TYPES;

/** Roles that may write CRM records in bulk (apply a member load, undo one). */
export const OPERATOR_ROLES: readonly string[] = ["admin", "manager"];

/**
 * Applying a member load and undoing one create and soft-delete CRM records, so they are
 * SESSION ONLY with an operator role (Kai's ruling on Vanda #188-3): an app key may dry-run a
 * load and propose, never apply.
 */
async function needsOperator(ctx: CampaignCtx): Promise<Fail | null> {
  const s = needsSession(ctx);
  if (s) return s;
  const u = await db.user.findFirst({ where: { id: ctx.userId!, tenantId: ctx.tenantId }, select: { role: true } });
  return u && OPERATOR_ROLES.includes(u.role) ? null : fail(403, "Ehhez admin vagy manager szerep kell");
}

/**
 * Apply/undo of a member load: a session operator, or an app key holding prospects:write. A key only touches
 * batches named `<its app slug>-...`, so it can never undo a load a person made (Vanda #197-3).
 */
async function needsProspectWriter(ctx: CampaignCtx, batch: string): Promise<Fail | null> {
  if (ctx.userId == null && ctx.scopes?.includes("prospects:write")) {
    return ctx.appSlug && batch.startsWith(`${ctx.appSlug}-`) ? null : fail(403, `Egy app kulcs csak a saját betöltését írhatja és vonhatja vissza (batch: ${ctx.appSlug ?? "app"}-...)`);
  }
  return needsOperator(ctx);
}

// ---------------------------------------------------------------------------------------------
// Read

const CAMPAIGN_SELECT = {
  id: true, slug: true, name: true, kind: true, status: true, dailyCap: true, ownerUserId: true, senderUserId: true,
  startsOn: true, endsOn: true, brief: true, briefProposal: true, audience: true, project: true,
  approvedById: true, approvedAt: true, approvedHash: true, outboundAutomations: true, isArchived: true, createdAt: true,
  steps: {
    orderBy: { position: "asc" as const },
    select: { position: true, channel: true, waitDays: true, audienceRule: true, contentItemId: true },
  },
} satisfies Prisma.CampaignSelect;

export async function listCampaigns(tenantId: number, opts: { includeArchived?: boolean } = {}) {
  const rows = await db.campaign.findMany({
    where: { tenantId, ...(opts.includeArchived ? {} : { isArchived: false }) },
    orderBy: { createdAt: "desc" },
    select: CAMPAIGN_SELECT,
  });
  const counts = await db.campaignMember.groupBy({
    by: ["campaignId", "state"],
    where: { tenantId, campaignId: { in: rows.map((r) => r.id) } },
    _count: { _all: true },
  });
  return rows.map((r) => ({
    ...r,
    members: Object.fromEntries(counts.filter((c) => c.campaignId === r.id).map((c) => [c.state, c._count._all])),
  }));
}

export async function getCampaign(tenantId: number, slug: string) {
  return db.campaign.findFirst({ where: { tenantId, slug }, select: CAMPAIGN_SELECT });
}

// ---------------------------------------------------------------------------------------------
// Create, edit (draft writes)

function slugify(name: string): string {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

async function uniqueSlug(tenantId: number, base: string): Promise<string> {
  const root = (base || "kampany").slice(0, 60);
  const taken = new Set((await db.campaign.findMany({ where: { tenantId, slug: { startsWith: root } }, select: { slug: true } })).map((c) => c.slug));
  if (!taken.has(root)) return root;
  for (let i = 2; ; i++) if (!taken.has(`${root}-${i}`)) return `${root}-${i}`;
}

export interface StepInput {
  channel: StepChannel;
  wait_days?: number;
  audience_rule?: StepCondition;
  content_item_id?: number | null;
}

async function checkStepItems(tenantId: number, steps: readonly StepInput[], campaignId: number | null): Promise<Fail | null> {
  const ids = steps.map((s) => s.content_item_id).filter((v): v is number => v != null);
  if (ids.length === 0) return null;
  const items = await db.contentItem.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, campaignId: true } });
  if (items.length !== new Set(ids).size) return fail(400, "Ismeretlen anyag a lépésekben");
  if (campaignId != null && items.some((i) => i.campaignId != null && i.campaignId !== campaignId)) {
    return fail(400, "Egy lépés anyaga másik kampányé");
  }
  return null;
}

const stepRows = (tenantId: number, campaignId: number, steps: readonly StepInput[]) =>
  steps.map((s, i) => ({
    tenantId, campaignId, position: i + 1, channel: s.channel, waitDays: s.wait_days ?? 0,
    audienceRule: s.audience_rule ?? "all", contentItemId: s.content_item_id ?? null,
  }));

export async function createCampaign(
  ctx: CampaignCtx,
  input: {
    name: string; kind: string; slug?: string; owner_user_id?: number | null; daily_cap?: number;
    starts_on?: string | null; ends_on?: string | null; brief?: Prisma.InputJsonValue; audience?: Prisma.InputJsonValue;
    project?: string | null; steps?: StepInput[];
  },
) {
  const steps = input.steps ?? [];
  const misfit = stepsFitKind(input.kind as CampaignKind, steps.map((st, i) => ({ channel: st.channel, position: i + 1 })), audienceOf(input.audience).source);
  if (misfit) return fail(400, misfit);
  const bad = await checkStepItems(ctx.tenantId, steps, null);
  if (bad) return bad;
  if (input.owner_user_id != null) {
    const u = await db.user.findFirst({ where: { id: input.owner_user_id, tenantId: ctx.tenantId }, select: { id: true } });
    if (!u) return fail(400, "Ismeretlen felelős");
  }
  const slug = await uniqueSlug(ctx.tenantId, slugify(input.slug ?? input.name));
  const created = await db.$transaction(async (tx) => {
    const c = await tx.campaign.create({
      data: {
        tenantId: ctx.tenantId, slug, name: input.name, kind: input.kind, status: "draft",
        dailyCap: input.daily_cap ?? 15, ownerUserId: input.owner_user_id ?? null, project: input.project ?? null,
        startsOn: input.starts_on ? new Date(`${input.starts_on}T00:00:00Z`) : null,
        endsOn: input.ends_on ? new Date(`${input.ends_on}T00:00:00Z`) : null,
        ...(input.brief !== undefined ? { brief: input.brief } : {}),
        ...(input.audience !== undefined ? { audience: input.audience } : {}),
      },
      select: { id: true, slug: true },
    });
    if (steps.length) await tx.campaignStep.createMany({ data: stepRows(ctx.tenantId, c.id, steps) });
    return c;
  });
  // Assets an agent attached before the campaign existed keep their own campaign_id; only
  // ones with none are claimed here, so a step never points at another campaign's asset.
  const ids = steps.map((s) => s.content_item_id).filter((v): v is number => v != null);
  if (ids.length) await db.contentItem.updateMany({ where: { tenantId: ctx.tenantId, id: { in: ids }, campaignId: null }, data: { campaignId: created.id } });
  audit("campaign", created.id, "create", null, { slug, kind: input.kind, steps: steps.length }, auditOpts(ctx));
  return { ok: true as const, id: created.id, slug: created.slug };
}

/** Back to draft: any edit of what Áron approved (members, steps, cap) stops the daily list until he approves again. */
const BACK_TO_DRAFT = { status: "draft", approvedById: null, approvedAt: null, approvedHash: null } as const;

async function loadForWrite(tenantId: number, slug: string) {
  return db.campaign.findFirst({ where: { tenantId, slug }, select: { id: true, slug: true, status: true, dailyCap: true, kind: true, audience: true } });
}

export async function setSteps(ctx: CampaignCtx, slug: string, steps: StepInput[]) {
  const s = needsSession(ctx);
  if (s) return s;
  const c = await loadForWrite(ctx.tenantId, slug);
  if (!c) return fail(404, "Kampány nem található");
  if (c.status === "stopped" || c.status === "done") return fail(409, "Lezárt kampány lépései nem módosíthatók");
  const misfit = stepsFitKind(c.kind as CampaignKind | null, steps.map((st, i) => ({ channel: st.channel, position: i + 1 })), audienceOf(c.audience).source);
  if (misfit) return fail(400, misfit);
  const bad = await checkStepItems(ctx.tenantId, steps, c.id);
  if (bad) return bad;
  let retired: number[] = [];
  await db.$transaction(async (tx) => {
    await lockCampaign(tx, c.id);
    // Unsent drafts of a removed step, or of a step whose asset or channel changed, carry text Áron did not
    // approve. Deleted, not cancelled: a kept row would block the re-draft and strand the member (Vanda #194 r2, r3).
    const before = await tx.campaignStep.findMany({ where: { tenantId: ctx.tenantId, campaignId: c.id }, select: { position: true, channel: true, contentItemId: true } });
    const stale = before.filter((b) => {
      const n = steps[b.position - 1];
      return !n || (n.content_item_id ?? null) !== b.contentItemId || n.channel !== b.channel;
    }).map((b) => b.position);
    if (stale.length) {
      const gone = await tx.emailDraft.findMany({
        where: { tenantId: ctx.tenantId, campaign: c.slug, step: { in: stale }, status: { in: ["draft", "approved", "failed"] } },
        select: { id: true },
      });
      if (gone.length) {
        await tx.emailDraft.deleteMany({ where: { tenantId: ctx.tenantId, id: { in: gone.map((g) => g.id) } } });
        retired = gone.map((g) => g.id);
      }
    }
    await tx.campaignStep.deleteMany({ where: { tenantId: ctx.tenantId, campaignId: c.id } });
    if (steps.length) await tx.campaignStep.createMany({ data: stepRows(ctx.tenantId, c.id, steps) });
    // A member keeps its place in line; one past the new end has finished the sequence (item 4, remapAfterEdit).
    if (steps.length) {
      await tx.campaignMember.updateMany({
        where: { tenantId: ctx.tenantId, campaignId: c.id, stepPosition: { gt: steps.length }, state: { in: [...OPEN_MEMBER_STATES] } },
        data: { state: "done", stepPosition: steps.length, stateChangedAt: new Date() },
      });
    }
    if (c.status !== "draft") await tx.campaign.update({ where: { id: c.id }, data: BACK_TO_DRAFT });
  });
  audit("campaign", c.id, "update", { status: c.status }, { steps: steps.length, status: "draft", ...(retired.length ? { retiredDrafts: retired } : {}) }, auditOpts(ctx));
  return { ok: true as const, status: "draft" as const };
}

export async function updateCampaign(
  ctx: CampaignCtx,
  slug: string,
  patch: { name?: string; daily_cap?: number; owner_user_id?: number | null; starts_on?: string | null; ends_on?: string | null; brief?: Prisma.InputJsonValue; adopt_brief_proposal?: boolean; outbound_automations?: boolean; audience?: { source: AudienceSource; stages?: string[] } },
) {
  const s = needsSession(ctx);
  if (s) return s;
  const c = await db.campaign.findFirst({ where: { tenantId: ctx.tenantId, slug }, select: { id: true, status: true, dailyCap: true, briefProposal: true, outboundAutomations: true, audience: true } });
  if (!c) return fail(404, "Kampány nem található");
  if (c.status === "stopped" || c.status === "done") return fail(409, "Lezárt kampány nem módosítható");
  const outboundChanged = patch.outbound_automations !== undefined && patch.outbound_automations !== c.outboundAutomations;
  if (outboundChanged && !(await isAron(ctx))) return fail(403, "A kimenő automatizmusokat csak Áron kapcsolhatja");
  if (patch.owner_user_id != null) {
    const u = await db.user.findFirst({ where: { id: patch.owner_user_id, tenantId: ctx.tenantId }, select: { id: true } });
    if (!u) return fail(400, "Ismeretlen felelős");
  }
  // Cap and outbound switch are part of the approval hash: changing either needs a new approval.
  // Who is touched is part of what Áron approves: a new audience needs a new approval too (item 4).
  if (patch.audience?.source === "leads_by_stage") {
    const known = new Set((await getLeadStatuses(ctx.tenantId)).map((x) => x.key));
    if (!patch.audience.stages?.length || patch.audience.stages.some((x) => !known.has(x) || x === "won" || x === "lost")) return fail(400, "Válassz legalább egy nyitott lead szakaszt");
  }
  const audience = patch.audience ? { source: patch.audience.source, stages: patch.audience.source === "leads_by_stage" ? [...new Set(patch.audience.stages ?? [])] : [] } : undefined;
  const audienceChanged = audience !== undefined && JSON.stringify(audience) !== JSON.stringify(audienceOf(c.audience));
  const capChanged = (patch.daily_cap !== undefined && patch.daily_cap !== c.dailyCap) || outboundChanged || audienceChanged;
  const brief = patch.adopt_brief_proposal ? ((c.briefProposal as Prisma.JsonObject | null)?.brief as Prisma.InputJsonValue | undefined) : patch.brief;
  const data: Prisma.CampaignUpdateInput = {
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.daily_cap !== undefined ? { dailyCap: patch.daily_cap } : {}),
    ...(patch.owner_user_id !== undefined ? { owner: patch.owner_user_id == null ? { disconnect: true } : { connect: { id: patch.owner_user_id } } } : {}),
    ...(patch.starts_on !== undefined ? { startsOn: patch.starts_on ? new Date(`${patch.starts_on}T00:00:00Z`) : null } : {}),
    ...(patch.ends_on !== undefined ? { endsOn: patch.ends_on ? new Date(`${patch.ends_on}T00:00:00Z`) : null } : {}),
    ...(brief !== undefined ? { brief } : {}),
    ...(outboundChanged ? { outboundAutomations: patch.outbound_automations } : {}),
    ...(audience !== undefined ? { audience } : {}),
    ...(capChanged && c.status !== "draft" ? BACK_TO_DRAFT : {}),
  };
  await db.campaign.update({ where: { id: c.id }, data });
  audit("campaign", c.id, "update", { dailyCap: c.dailyCap, status: c.status }, { ...patch, ...(capChanged && c.status !== "draft" ? { status: "draft" } : {}) }, auditOpts(ctx));
  return { ok: true as const, status: (capChanged && c.status !== "draft" ? "draft" : c.status) as CampaignStatus };
}

// ---------------------------------------------------------------------------------------------
// Specify (AI / agent): proposals only

export interface SpecifyInput {
  brief?: Record<string, unknown>;
  steps?: StepInput[];
  assets?: { title: string; body: string; category: ContentCategory; channel: string; content_type: string; format?: string | null; purpose?: string | null; step_position?: number }[];
  note?: string;
}

/**
 * What an agent may write: a proposed brief and step plan (stored in brief_proposal, never over
 * the human brief or the real steps) and assets through the content approval pipeline
 * (createItem: version 1, in review). Never members, cap, status or approval. Refused on a
 * running campaign: a live campaign changes only by a human edit that sends it back to draft.
 */
export async function specifyCampaign(ctx: CampaignCtx, slug: string, input: SpecifyInput) {
  const c = await db.campaign.findFirst({ where: { tenantId: ctx.tenantId, slug }, select: { id: true, status: true, kind: true } });
  if (!c) return fail(404, "Kampány nem található");
  if (c.status === "running") return fail(409, "Futó kampányhoz nem írható javaslat; előbb álljon meg vagy legyen piszkozat");
  if (c.status === "stopped" || c.status === "done") return fail(409, "Lezárt kampány");
  // An empty proposal answers nothing: it would wipe the last one and close open requests (Vanda #192-3).
  if (!Object.keys(input.brief ?? {}).length && !input.steps?.length && !input.assets?.length && !input.note?.trim()) return fail(400, "Üres javaslat: brief, lépések vagy anyag kell");
  if (input.steps) {
    const misfit = stepsFitKind(c.kind as CampaignKind | null, input.steps.map((st, i) => ({ channel: st.channel, position: i + 1 })));
    if (misfit) return fail(400, misfit);
    const bad = await checkStepItems(ctx.tenantId, input.steps, c.id);
    if (bad) return bad;
  }
  if (ctx.userId != null && input.assets?.length) return fail(400, "Bejelentkezve az anyagokat a Marketing oldalon add hozzá (ott a szerző rögzül)");
  const source = ctx.appSlug ?? "crm-ui";
  const actor = ctx.userId != null ? null : { tenantId: ctx.tenantId, kind: "app" as const, appSlug: source };
  const result = await db.$transaction(async (tx) => {
    const assets: { item_id: number; step_position: number | null }[] = [];
    for (const a of input.assets ?? []) {
      if (!actor) break; // unreachable: refused above for session users
      const r = await createItem(actor, {
        title: a.title, body: a.body, category: a.category, channel: a.channel, contentType: a.content_type,
        format: a.format ?? null, purpose: a.purpose ?? null, campaignId: c.id, source,
      }, tx);
      if (!r.ok) throw Object.assign(new Error(r.error), { status: r.status });
      assets.push({ item_id: r.itemId, step_position: a.step_position ?? null });
    }
    const proposal = {
      brief: input.brief ?? null, steps: input.steps ?? null, assets, note: input.note ?? null,
      proposed_by: source, proposed_at: new Date().toISOString(),
    };
    await tx.campaign.update({ where: { id: c.id }, data: { briefProposal: proposal as Prisma.InputJsonValue } });
    return proposal;
  }).catch((err: Error & { status?: number }) => {
    if (err.status) return fail(err.status as Fail["status"], err.message);
    throw err;
  });
  if ("error" in result) return result;
  audit("campaign", c.id, "update", null, { briefProposal: { by: source, assets: result.assets.length } }, auditOpts(ctx));
  // The proposal answers the campaign's open specification requests (item 6).
  await closeSpecRequests(ctx.tenantId, slug, auditOpts(ctx), source);
  return { ok: true as const, proposal: result };
}

// ---------------------------------------------------------------------------------------------
// Members

export async function addMembers(ctx: CampaignCtx, slug: string, input: { dry_run: boolean; batch: string; rows: MemberRow[] }) {
  const c = await db.campaign.findFirst({
    where: { tenantId: ctx.tenantId, slug },
    select: { id: true, status: true, kind: true, audience: true, steps: { select: { position: true, channel: true, waitDays: true, audienceRule: true } } },
  });
  if (!c) return fail(404, "Kampány nem található");
  if (audienceOf(c.audience).source === "leads_by_stage") return fail(409, "Ennek a kampánynak a közönsége leadek szakasz szerint; prospekt lista nem tölthető be");
  if (!input.dry_run) {
    const s = await needsProspectWriter(ctx, input.batch);
    if (s) return s;
  }
  if (!MEMBER_KINDS.includes(c.kind as CampaignKind)) return fail(409, "Ez a kampánytípus csak tartalom, tagokat nem kap");
  if (c.status === "stopped" || c.status === "done") return fail(409, "Lezárt kampányhoz nem adható tag");
  if (c.steps.length === 0) return fail(409, "Előbb a lépéseket kell megadni (a tagok kezdő lépése ebből jön)");
  const steps = c.steps as StepDef[];
  const tenantId = ctx.tenantId;

  const [companies, openLeads, members, suppressions] = await Promise.all([
    db.company.findMany({ where: { tenantId, deletedAt: null }, select: { id: true, name: true, vatNumber: true, status: true } }),
    db.lead.findMany({ where: { tenantId, outcome: "open", convertedDealId: null, companyId: { not: null } }, select: { companyId: true } }),
    db.campaignMember.findMany({ where: { tenantId, campaignId: c.id }, select: { companyId: true, state: true } }),
    loadSuppressionSet(tenantId),
  ]);
  const byVat = new Map<string, number>();
  const byName = new Map<string, number>();
  for (const co of companies) {
    const vat = normalizeVat(co.vatNumber);
    if (vat) byVat.set(vat, co.id);
    const key = companyKey(co.name);
    if (key && co.status !== "fa" && !byName.has(key)) byName.set(key, co.id); // same rule as the import index
  }
  const emails = [...new Set(input.rows.map((r) => (r.email ? normalizeEmail(r.email) : null)).filter((e): e is string => Boolean(e)))];
  const persons = emails.length
    ? await db.person.findMany({ where: { tenantId, deletedAt: null, email: { in: emails, mode: "insensitive" } }, select: { id: true, email: true } })
    : [];
  const personByEmail = new Map(persons.map((p) => [normalizeEmail(p.email)!, p.id]));
  // Resolve every row's company the way the planner will (id, VAT, name key), then load their contacts (Vanda #188-6).
  const resolvedIds = [...new Set(input.rows.map((r) => {
    if (r.crm_company_id != null) return r.crm_company_id;
    const vat = normalizeVat(r.vat ?? null);
    const key = companyKey(r.company_name);
    return (vat ? byVat.get(vat) : undefined) ?? (key ? byName.get(key) : undefined) ?? null;
  }).filter((v): v is number => v != null))];
  const contacts = await db.contact.findMany({
    where: { tenantId, endedAt: null, companyId: { in: resolvedIds } },
    select: { companyId: true, personId: true, email: true, phone: true, person: { select: { email: true, phone: true } } },
  });
  const companyReach = reachFromContacts(contacts, suppressions);

  const plan: MembersPlan = planMembers(input.rows, {
    aliveCompanyIds: new Set(companies.map((x) => x.id)), byVat, byName,
    openLeadCompanyIds: new Set(openLeads.map((l) => l.companyId!)),
    members: new Map(members.map((m) => [m.companyId, m.state])),
    suppressions, personByEmail, companyReach,
  }, steps);

  if (input.dry_run) return { ok: true as const, dry_run: true, batch: input.batch, summary: plan.summary, rows: plan.rows };

  const writes = plan.rows.filter((p) => p.action !== "skip");
  const result = await db.$transaction(async (tx) => {
    await lockCampaign(tx, c.id);
    let added = 0, refreshed = 0;
    for (const p of writes) {
      const r = input.rows[p.row - 1];
      let companyId = p.companyId;
      const createdCompany = companyId == null;
      if (companyId == null) {
        const vat = normalizeVat(r.vat ?? null);
        const co = await tx.company.create({
          data: {
            tenantId, name: r.company_name, vatNumber: vat, city: r.city ?? null, website: r.website ?? null,
            status: "active", accountType: "Prospect", leadSource: `campaign:${slug}`,
          },
          select: { id: true },
        });
        companyId = co.id;
      }
      let personId: number | null = typeof p.person === "number" ? p.person : null;
      let createdPerson = false;
      if (p.person === "create") {
        const [first, ...rest] = (r.person_name ?? "").trim().split(/\s+/).filter(Boolean);
        const pr = await tx.person.create({
          data: { tenantId, firstName: first ?? "-", lastName: rest.join(" ") || "-", email: r.email ? normalizeEmail(r.email) : null, phone: r.phone ?? null },
          select: { id: true },
        });
        personId = pr.id;
        createdPerson = true;
      }
      if (personId != null && (r.email || r.phone || r.role)) {
        const has = await tx.contact.findFirst({ where: { tenantId, personId, companyId, endedAt: null }, select: { id: true } });
        if (!has) await tx.contact.create({ data: { tenantId, personId, companyId, role: r.role ?? null, email: r.email ? normalizeEmail(r.email) : null, phone: r.phone ?? null } });
      }
      if (p.action === "refresh") {
        await tx.campaignMember.updateMany({
          where: { tenantId, campaignId: c.id, companyId, state: { in: ["needs_contact", "needs_email"] } },
          data: { state: p.state, stepPosition: p.stepPosition, personId, stateChangedAt: new Date() },
        });
        refreshed++;
      } else {
        await tx.campaignMember.create({
          data: {
            tenantId, campaignId: c.id, companyId, personId, state: p.state, stepPosition: p.stepPosition,
            priority: r.priority ?? 100, tier: r.tier ?? null, lane: r.lane ?? null,
            why: r.why ?? null, city: r.city ?? null, importBatch: input.batch, createdCompany, createdPerson,
            segment: r.segment ?? null, source: r.source ?? null, contactSource: r.contact_source ?? null,
          },
        });
        added++;
      }
    }
    if (c.status !== "draft" && (added > 0 || refreshed > 0)) await tx.campaign.update({ where: { id: c.id }, data: BACK_TO_DRAFT });
    return { added, refreshed };
  }, { timeout: 60_000 }).catch((err: { code?: string }) => {
    // A concurrent load of the same company (unique campaign_id, company_id): retry the dry run.
    if (err?.code === "P2002") return null;
    throw err;
  });
  if (!result) return fail(409, "Egy másik betöltés közben fut; futtasd újra a próbát");
  audit("campaign", c.id, "update", null, { membersAdded: result.added, membersRefreshed: result.refreshed, batch: input.batch }, auditOpts(ctx));
  return { ok: true as const, dry_run: false, batch: input.batch, summary: plan.summary, ...result, status: c.status !== "draft" && result.added + result.refreshed > 0 ? "draft" : c.status };
}

/**
 * Undo one load: removes the batch's members that were never touched, and soft-deletes the
 * companies and persons that batch created when nothing else points at them. Touched members
 * stay (their interactions are append-only).
 */
export async function undoBatch(ctx: CampaignCtx, slug: string, batch: string, dryRun: boolean) {
  const c = await db.campaign.findFirst({ where: { tenantId: ctx.tenantId, slug }, select: { id: true } });
  if (!c) return fail(404, "Kampány nem található");
  if (!dryRun) {
    const s = await needsProspectWriter(ctx, batch);
    if (s) return s;
  }
  const tenantId = ctx.tenantId;
  const rows = await db.campaignMember.findMany({
    where: { tenantId, campaignId: c.id, importBatch: batch },
    select: { id: true, companyId: true, personId: true, attempts: true, lastTouchedAt: true, leadId: true, createdCompany: true, createdPerson: true },
  });
  const untouched = rows.filter((m) => m.attempts === 0 && m.lastTouchedAt == null && m.leadId == null);
  const kept = rows.length - untouched.length;
  const companyIds = untouched.filter((m) => m.createdCompany).map((m) => m.companyId);
  const personIds = untouched.filter((m) => m.createdPerson && m.personId != null).map((m) => m.personId!);
  // A created company is only soft-deleted when nothing else refers to it.
  const batchPersons = new Set(personIds);
  const [leadRefs, interRefs, otherMembers, draftRefs, dealRefs, quoteRefs, taskRefs, invoiceRefs, proposalRefs, contactRefs] = await Promise.all([
    db.lead.findMany({ where: { tenantId, companyId: { in: companyIds } }, select: { companyId: true } }),
    db.interaction.findMany({ where: { tenantId, companyId: { in: companyIds } }, select: { companyId: true } }),
    db.campaignMember.findMany({ where: { tenantId, companyId: { in: companyIds }, NOT: { campaignId: c.id, importBatch: batch } }, select: { companyId: true } }),
    db.emailDraft.findMany({ where: { tenantId, companyId: { in: companyIds } }, select: { companyId: true } }),
    db.deal.findMany({ where: { tenantId, companyId: { in: companyIds } }, select: { companyId: true } }),
    db.quote.findMany({ where: { tenantId, companyId: { in: companyIds } }, select: { companyId: true } }),
    db.task.findMany({ where: { tenantId, companyId: { in: companyIds } }, select: { companyId: true } }),
    db.invoice.findMany({ where: { tenantId, companyId: { in: companyIds } }, select: { companyId: true } }),
    db.proposal.findMany({ where: { tenantId, companyId: { in: companyIds } }, select: { companyId: true } }),
    db.contact.findMany({ where: { tenantId, companyId: { in: companyIds } }, select: { companyId: true, personId: true } }),
  ]);
  // Busy = anything a human or another flow added since: any reference, or a contact whose person this batch did not create (Vanda #188-4).
  const busy = new Set<number | null>([
    ...leadRefs, ...interRefs, ...otherMembers, ...draftRefs, ...dealRefs, ...quoteRefs, ...taskRefs, ...invoiceRefs, ...proposalRefs,
    ...contactRefs.filter((k) => !batchPersons.has(k.personId)),
  ].map((r) => r.companyId));
  const dropCompanies = companyIds.filter((id) => !busy.has(id));
  const summary = { members: rows.length, remove: untouched.length, keptTouched: kept, softDeleteCompanies: dropCompanies.length, softDeletePersons: personIds.length };
  if (dryRun) return { ok: true as const, dry_run: true, batch, summary };
  const now = new Date();
  const toDraft = await db.$transaction(async (tx) => {
    await lockCampaign(tx, c.id);
    // Status read under the lock, so an approve that committed meanwhile is reverted too.
    const st = (await tx.campaign.findFirst({ where: { id: c.id, tenantId }, select: { status: true } }))?.status;
    // Only members still untouched at commit time (an outcome may have landed since the read).
    const { count: removed } = await tx.campaignMember.deleteMany({ where: { tenantId, id: { in: untouched.map((m) => m.id) }, attempts: 0, lastTouchedAt: null, leadId: null } });
    // Members are part of what Áron approved: an undo on a running or paused campaign needs a new approval (Vanda #190-4).
    const back = removed > 0 && (st === "running" || st === "paused");
    if (back) await tx.campaign.update({ where: { id: c.id }, data: BACK_TO_DRAFT });
    if (dropCompanies.length) {
      await tx.contact.updateMany({ where: { tenantId, companyId: { in: dropCompanies }, endedAt: null }, data: { endedAt: now } });
      await tx.company.updateMany({ where: { tenantId, id: { in: dropCompanies } }, data: { deletedAt: now } });
    }
    if (personIds.length) {
      // shortcut: a created person is soft-deleted unless another live contact links them; the person import dedupes by e-mail, so a person reused elsewhere has such a contact.
      const linked = new Set((await tx.contact.findMany({ where: { tenantId, personId: { in: personIds }, endedAt: null }, select: { personId: true } })).map((k) => k.personId));
      const drop = personIds.filter((id) => !linked.has(id));
      if (drop.length) await tx.person.updateMany({ where: { tenantId, id: { in: drop } }, data: { deletedAt: now } });
    }
    return back;
  });
  audit("campaign", c.id, "update", null, { undoBatch: batch, ...summary, ...(toDraft ? { status: "draft" } : {}) }, auditOpts(ctx));
  return { ok: true as const, dry_run: false, batch, summary, ...(toDraft ? { status: "draft" as const } : {}) };
}

// ---------------------------------------------------------------------------------------------
// Approve (Áron only), pause, stop

/**
 * `expect.hash`: the approval hash of what the approver saw (members, steps with their assets, cap,
 * outbound switch). When given and the campaign changed since, 409 instead of launching something
 * nobody looked at, even a same-size member swap (Vanda #190-8, r2).
 */
export async function approveCampaign(ctx: CampaignCtx, slug: string, expect?: { hash: string }) {
  const s = needsSession(ctx);
  if (s) return s;
  if (!(await isAron(ctx))) return fail(403, "Kampányt csak Áron indíthat");
  const head = await db.campaign.findFirst({ where: { tenantId: ctx.tenantId, slug }, select: { id: true } });
  if (!head) return fail(404, "Kampány nem található");
  // One transaction under the campaign row lock: what is hashed is exactly what launches (Vanda #188-2).
  return db.$transaction(async (tx) => {
  await lockCampaign(tx, head.id);
  const c = await tx.campaign.findFirst({
    where: { tenantId: ctx.tenantId, id: head.id },
    select: { id: true, status: true, kind: true, dailyCap: true, outboundAutomations: true, audience: true, steps: { select: { position: true, channel: true, waitDays: true, audienceRule: true, contentItemId: true, contentItem: { select: { status: true } } } } },
  });
  if (!c) return fail(404, "Kampány nem található");
  if (!canApprove(c.status as CampaignStatus)) return fail(409, `Ebből az állapotból nem indítható (${c.status})`);
  if (!MEMBER_KINDS.includes(c.kind as CampaignKind)) return fail(409, "Ez a kampánytípus csak tartalom, nincs mit indítani");
  if (c.steps.length === 0) return fail(409, "Nincs lépés");
  const misfit = stepsFitKind(c.kind as CampaignKind, c.steps, audienceOf(c.audience).source);
  if (misfit) return fail(409, misfit);
  // An e-mail step needs its own live asset or segment variants, and every variant live: a proposal never launches.
  const variants = await campaignVariants(ctx.tenantId, c.id, tx);
  if (variants.some((v) => v.status !== "live")) return fail(409, "Egy szegmensváltozat még nincs jóváhagyva (élő)");
  if (c.steps.some((st) => st.channel === "email" && st.contentItem?.status !== "live" && !variants.some((v) => v.step === st.position))) return fail(409, "Az e-mail lépés anyaga még nincs jóváhagyva (élő)");
  if (c.steps.some((st) => st.contentItemId != null && st.contentItem?.status !== "live")) return fail(409, "Egy lépés anyaga még nincs jóváhagyva (élő)");
  const members = await tx.campaignMember.findMany({ where: { tenantId: ctx.tenantId, campaignId: c.id }, select: { companyId: true, state: true } });
  if (!members.some((m) => m.state === "queued")) return fail(409, "Nincs hívható vagy írható tag");
  const hash = approvalHash({ memberCompanyIds: members.map((m) => m.companyId), steps: c.steps as (StepDef & { contentItemId: number | null })[], dailyCap: c.dailyCap, outboundAutomations: c.outboundAutomations, audience: audienceOf(c.audience), variants });
  if (expect && expect.hash !== hash) return fail(409, "A kampány változott, mióta megnyitottad; frissíts és nézd át újra");
  const now = new Date();
  // Guard on the status we read: a concurrent edit that sent it back to draft is fine, a
  // concurrent stop is not overwritten.
  const { count } = await tx.campaign.updateMany({
    where: { id: c.id, tenantId: ctx.tenantId, status: c.status },
    data: { status: "running", approvedById: ctx.userId, approvedAt: now, approvedHash: hash },
  });
  if (count === 0) return fail(409, "A kampány időközben változott, frissíts");
  audit("campaign", c.id, "update", { status: c.status }, { status: "running", approvedHash: hash, members: members.length, dailyCap: c.dailyCap }, auditOpts(ctx));
  return { ok: true as const, status: "running" as const, approved_hash: hash, members: members.length };
  });
}

export async function setCampaignStatus(ctx: CampaignCtx, slug: string, to: "paused" | "stopped") {
  // Pausing is the safe direction: an agent may pause (bounce, suppression hit). Stopping is final: a human.
  if (to === "stopped") {
    const s = needsSession(ctx);
    if (s) return s;
  }
  const c = await db.campaign.findFirst({ where: { tenantId: ctx.tenantId, slug }, select: { id: true, status: true } });
  if (!c) return fail(404, "Kampány nem található");
  if (!canSetStatus(c.status as CampaignStatus, to)) return fail(409, `Ebből az állapotból nem lehet ${to} (${c.status})`);
  const { count } = await db.campaign.updateMany({ where: { id: c.id, tenantId: ctx.tenantId, status: c.status }, data: { status: to } });
  if (count === 0) return fail(409, "A kampány időközben változott, frissíts");
  audit("campaign", c.id, "update", { status: c.status }, { status: to }, auditOpts(ctx));
  return { ok: true as const, status: to };
}

// ---------------------------------------------------------------------------------------------
// Today's list (computed on read)

export async function dailyList(tenantId: number, slug: string, now: Date = new Date()) {
  const c = await db.campaign.findFirst({
    where: { tenantId, slug },
    select: {
      id: true, slug: true, name: true, status: true, dailyCap: true, startsOn: true, endsOn: true, audience: true,
      steps: { orderBy: { position: "asc" }, select: { position: true, channel: true, contentItemId: true } },
    },
  });
  if (!c) return fail(404, "Kampány nem található");
  const callSteps = new Set(c.steps.filter((s) => s.channel === "call").map((s) => s.position));
  // Outside its dates a running campaign lists nobody: Kezdés 11-26 means no call before 11-26 (Vanda #190-3).
  const ymdKey = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
  if (c.status !== "running" || !inWindow(ymdKey(c.startsOn), ymdKey(c.endsOn), localDay(now).key)) {
    return { ok: true as const, campaign: { slug: c.slug, name: c.name, status: c.status, dailyCap: c.dailyCap }, items: [], touchedToday: 0, remaining: 0, script: null, scripts: {} };
  }
  const all = await db.campaignMember.findMany({
    where: { tenantId, campaignId: c.id, company: { deletedAt: null } },
    select: { id: true, state: true, stepPosition: true, nextEligibleOn: true, priority: true, city: true, lastTouchedAt: true, companyId: true },
  });
  // A company that became a lead some other way leaves the list (its lead owns the follow-up).
  const open = new Set((await db.lead.findMany({
    where: { tenantId, outcome: "open", convertedDealId: null, companyId: { in: all.map((m) => m.companyId) } },
    select: { companyId: true },
  })).map((l) => l.companyId));
  // Prospects: a company that became a lead leaves the list. Leads by stage: the reverse, a lead that closed leaves it.
  const leadsAudience = audienceOf(c.audience).source === "leads_by_stage";
  const sel = selectDailyList(
    // Still counted for "touched today" (the cap), never listed.
    all.map((m) => ({
      ...m,
      state: m.state === "queued" && (leadsAudience ? !open.has(m.companyId) : open.has(m.companyId)) ? "has_open_lead" : m.state,
      nextEligibleOn: m.nextEligibleOn ? m.nextEligibleOn.toISOString().slice(0, 10) : null,
    })),
    callSteps, c.dailyCap, now,
  );
  const rows = await db.campaignMember.findMany({
    where: { tenantId, id: { in: sel.ids } },
    select: {
      id: true, attempts: true, lastOutcome: true, lastTouchedAt: true, why: true, tier: true, city: true, stepPosition: true,
      company: { select: { id: true, name: true, city: true, website: true } },
      person: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
    },
  });
  const order = new Map(sel.ids.map((id, i) => [id, i]));
  rows.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  // Each call step's own script: its LIVE content item (current version body), by step position (item 6).
  const scriptIds = c.steps.map((s) => scriptItemFor(c.steps, s.position)).filter((v): v is number => v != null);
  const live = scriptIds.length
    ? await db.contentItem.findMany({ where: { tenantId, id: { in: scriptIds }, status: "live" }, select: { id: true, title: true, body: true } })
    : [];
  const scripts: Record<number, { id: number; title: string; body: string }> = {};
  for (const s of c.steps) {
    const hit = live.find((i) => i.id === scriptItemFor(c.steps, s.position));
    if (hit) scripts[s.position] = hit;
  }
  // `script` (pre item 6 field): the first listed member's step script, else the first call step's.
  const firstCall = c.steps.find((s) => s.channel === "call");
  const script = scripts[rows[0]?.stepPosition ?? firstCall?.position ?? 0] ?? null;
  return {
    ok: true as const,
    campaign: { slug: c.slug, name: c.name, status: c.status, dailyCap: c.dailyCap },
    items: rows, touchedToday: sel.touchedToday, remaining: sel.remaining, script, scripts,
  };
}

// ---------------------------------------------------------------------------------------------
// Record an outcome (call tap, e-mail event, agent from a transcript)

export interface OutcomeInput {
  member_id: number;
  outcome: OutcomeKey;
  notes?: string;
  duration_sec?: number;
  /** Next contact date (YYYY-MM-DD) the caller agreed; overrides the default due of a promotion. */
  followup_date?: string;
  /** E-mail events: the address the event came from (unsubscribe suppresses it even when the person has none). */
  email?: string;
}

/**
 * `callAlreadyLogged`: the call was written by the lead path (logLeadCallOutcome) or by the
 * first campaign of a /calls tap. This touch then moves only the member: no second interaction,
 * no company status write, no lead move (the lead path moved it). A missing lead is still
 * created by the promotion rule.
 */
export async function recordOutcome(ctx: CampaignCtx, slug: string, input: OutcomeInput, now: Date = new Date(), opts: { callAlreadyLogged?: boolean } = {}) {
  const tenantId = ctx.tenantId;
  const c = await db.campaign.findFirst({
    where: { tenantId, slug },
    select: { id: true, slug: true, status: true, ownerUserId: true, outboundAutomations: true, steps: { select: { position: true, channel: true, waitDays: true, audienceRule: true } } },
  });
  if (!c) return fail(404, "Kampány nem található");
  if (c.status !== "running" && c.status !== "paused") return fail(409, `Nem futó kampány (${c.status})`);
  const m = await db.campaignMember.findFirst({
    where: { id: input.member_id, tenantId, campaignId: c.id },
    select: {
      id: true, state: true, stepPosition: true, attempts: true, companyId: true, personId: true,
      company: { select: { name: true, pipelineStatus: true } },
      person: { select: { email: true, phone: true, firstName: true, lastName: true } },
    },
  });
  if (!m) return fail(404, "Kampánytag nem található");
  const reach = await db.contact.findFirst({ where: { tenantId, companyId: m.companyId, endedAt: null, NOT: { phone: null } }, select: { id: true } });
  const hasPhone = Boolean(m.person?.phone) || Boolean(reach);
  const today = localDay(now);
  // Conditions read the member's history: did it reply earlier in this campaign (item 4).
  const replied = Boolean(await db.campaignEvent.findFirst({ where: { tenantId, campaignId: c.id, memberId: m.id, outcome: "reply_positive" }, select: { id: true } }));
  const plan = planOutcome({ state: m.state as never, stepPosition: m.stepPosition, attempts: m.attempts, hasPhone, replied }, input.outcome, c.steps as StepDef[], today);
  if ("error" in plan) return fail(409, plan.error);

  const existingLead = await findOpenLead(db, tenantId, m.companyId);
  const ownerId = c.ownerUserId ?? (await resolveDemoHost(tenantId, "peter"));
  let followup: Date | null = null;
  if (input.followup_date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.followup_date)) return fail(400, "Érvénytelen dátum");
    const [y, mo, d] = input.followup_date.split("-").map(Number);
    followup = atLocal({ y, m: mo, d }, 9 * 60);
  }
  const who = m.person ? `${m.person.lastName} ${m.person.firstName}`.trim() : m.company.name;

  const res = await db.$transaction(async (tx) => {
    // One open lead per company: serialize promotions of the same company and re-check inside (Vanda #188-11).
    let lockedLead = existingLead;
    if (plan.promote) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${m.companyId}::bigint)`;
      lockedLead = await findOpenLead(tx, tenantId, m.companyId);
    }
    let interactionId: number | null = null;
    if (plan.logCall && !opts.callAlreadyLogged) {
      const meta = outcomeMeta(input.outcome)!;
      const base = input.notes?.trim() || meta.label;
      const dur = input.duration_sec && input.duration_sec > 0 ? Math.round(input.duration_sec) : null;
      const notes = dur ? `${base} · ${Math.floor(dur / 60)}:${String(dur % 60).padStart(2, "0")}` : base;
      const it = await tx.interaction.create({
        data: {
          tenantId, companyId: m.companyId, personId: m.personId, leadId: lockedLead?.id ?? null, userId: ctx.userId, type: "call", direction: "outbound",
          notes, outcome: meta.interactionOutcome, occurredAt: now, campaign: c.slug,
        },
        select: { id: true },
      });
      interactionId = it.id;
      // The call happened: the linked lead's open callback tasks are done (same as the lead path).
      if (lockedLead) await completeOpenLeadCallTasks(tx, lockedLead.id, tenantId, now);
      const newStatus = nextStatusFor(input.outcome, m.company.pipelineStatus);
      await tx.company.updateMany({ where: { id: m.companyId, tenantId }, data: { lastInteractionDate: now, ...(newStatus !== null ? { pipelineStatus: newStatus } : {}) } });
    }
    let leadId: number | null = lockedLead?.id ?? null;
    let created = false;
    if (plan.promote && !lockedLead) {
      const contact = m.personId != null
        ? await tx.contact.findFirst({ where: { tenantId, personId: m.personId, companyId: m.companyId, endedAt: null }, select: { id: true } })
        : null;
      const due = plan.promote.sla ? null : followup ?? atLocal(addWorkingDays(today, plan.promote.dueInWorkingDays), 9 * 60);
      const lead = await tx.lead.create({
        data: {
          tenantId, companyId: m.companyId, contactId: contact?.id ?? null, assignedToId: ownerId,
          source: "campaign", sourceApp: ctx.appSlug ?? "crm-ui", channel: input.outcome.startsWith("reply") ? "cold_email" : "cold_call",
          campaign: c.slug, status: plan.promote.stage, receivedDate: now, statusEnteredAt: now,
          // The SLA timer (startLeadLifecycle, after commit) sets owner, next action and due for an e-mail reply.
          ...(plan.promote.sla ? {} : { nextAction: plan.promote.nextAction, nextDue: due }),
          subject: `Kampány: ${c.slug}`,
        },
        select: { id: true },
      });
      if (!plan.promote.sla) {
        await tx.leadStatusHistory.create({ data: { tenantId, leadId: lead.id, fromStatus: null, toStatus: plan.promote.stage, event: "campaign_promoted", actorUserId: ctx.userId, actorAgentId: ctx.userId == null ? ctx.appSlug ?? null : null, at: now } });
      }
      leadId = lead.id;
      created = true;
    }
    // Guarded on the state we planned from: a double tap finds 0 rows and rolls the whole touch back
    // (lead included). After the lead insert: a promoted member must carry its lead_id (CHECK).
    const { count } = await tx.campaignMember.updateMany({
      where: { id: m.id, tenantId, state: m.state, attempts: m.attempts, stepPosition: m.stepPosition },
      data: {
        state: plan.member.state, stepPosition: plan.member.stepPosition, attempts: plan.member.attempts,
        nextEligibleOn: plan.member.nextEligibleOn ? new Date(`${plan.member.nextEligibleOn}T00:00:00Z`) : null,
        lastOutcome: plan.member.lastOutcome, lastTouchedAt: now,
        ...(plan.promote && leadId != null ? { leadId } : {}),
        ...(plan.member.state !== m.state ? { stateChangedAt: now } : {}),
      },
    });
    if (count === 0) throw Object.assign(new Error("A tag időközben változott, frissíts"), { status: 409 });

    if (plan.promote && leadId != null && interactionId != null && !lockedLead) {
      await tx.interaction.updateMany({ where: { id: interactionId, tenantId }, data: { leadId } });
    }
    await tx.campaignEvent.create({
      data: {
        tenantId, campaignId: c.id, memberId: m.id, stepPosition: m.stepPosition, outcome: input.outcome, leadId,
        actorUserId: ctx.userId, actorAgentId: ctx.userId == null ? ctx.appSlug ?? null : null, at: now,
      },
    });
    // A reply logged here stops the outreach exactly like /outreach and the IMAP intake (C2):
    // the newest sent touch of this campaign is the answered one.
    if (input.outcome === "reply_positive" || input.outcome === "reply_negative") {
      // The replying person's own touch; the company's newest only when the member has no person.
      const answered = await tx.emailDraft.findFirst({
        where: { tenantId, companyId: m.companyId, campaign: c.slug, status: "sent", ...(m.personId != null ? { personId: m.personId } : {}) },
        orderBy: [{ sentAt: "desc" }, { step: "desc" }],
        select: { id: true },
      });
      // Hub "positive" covers interested, question, forwarded: left for a person to classify.
      await stopTouchesAfterReply(tx, tenantId, m.companyId,
        answered ? { draftId: answered.id, replyType: input.outcome === "reply_negative" ? "no" : null } : null);
    }
    const suppressAddr = normalizeEmail(input.email ?? m.person?.email ?? null);
    if (plan.suppress && suppressAddr) {
      const email = suppressAddr;
      await tx.suppression.upsert({
        where: { tenantId_email: { tenantId, email } },
        create: { tenantId, email, requestedAt: new Date(`${today.key}T00:00:00Z`), channel: "email", source: c.slug, createdById: ctx.userId },
        update: {},
      });
    }
    return { interactionId, leadId, created, linked: lockedLead };
  }).catch((err: Error & { status?: number }) => {
    if (err.status) return fail(err.status as Fail["status"], err.message);
    throw err;
  });
  if ("error" in res) return res;

  // Post-commit, like every other lead intake: never roll the logged call back.
  if (res.interactionId != null) {
    await recomputeCloseness({ tenantId, companyId: m.companyId, personId: m.personId });
    audit("interaction", res.interactionId, "create", null,
      { type: "call", outcome: outcomeMeta(input.outcome)?.interactionOutcome ?? input.outcome, leadId: res.leadId, companyId: m.companyId, personId: m.personId }, auditOpts(ctx));
  }
  // A promotion never sends anything by itself: send_email and webhook_out rules are skipped
  // unless Áron switched the campaign's outbound automations on (Vanda #188-8).
  const outboundSkip = c.outboundAutomations ? [] : OUTBOUND_ACTIONS;
  let moved: { ok: boolean; error?: string } | null = null;
  if (res.created && res.leadId != null) {
    if (plan.promote?.sla) await startLeadLifecycle(tenantId, res.leadId, now);
    await runAutomations({
      skipActionTypes: outboundSkip,
      type: "lead_created", tenantId, leadId: res.leadId, companyId: m.companyId, personId: m.personId, companyName: m.company.name,
      fields: {
        company: m.company.name, source: "campaign", channel: input.outcome.startsWith("reply") ? "cold_email" : "cold_call",
        campaign: c.slug, serviceInterest: null, message: input.notes ?? null, sourceApp: ctx.appSlug ?? "crm-ui", tier: null,
      },
    }).catch((err) => reportError("campaigns.recordOutcome.automations", err, { leadId: res.leadId }));
  } else if (plan.promote && res.linked && !opts.callAlreadyLogged && isForwardMove(MAIN_STAGES, res.linked.status, plan.promote.stage)) {
    // An existing open lead moves forward only through the tenant's transition table.
    const r = await changeLeadStatus(res.linked.id, plan.promote.stage, {
      tenantId, userId: ctx.userId, actor: ctx.userId != null ? "user" : "agent", actorAgentId: ctx.appSlug,
    }, { nextAction: plan.promote.nextAction, skipAutomationActions: outboundSkip, ...(followup ? { nextDue: followup } : {}) });
    moved = "error" in r ? { ok: false, error: r.error } : { ok: true };
  }
  // Per-campaign automations (item 5): rules scoped to THIS campaign; outbound actions stay skipped unless Áron's switch is on.
  for (const type of campaignAutomationEvents(input.outcome, {
    promoted: Boolean(plan.promote && res.leadId != null), stepFrom: m.stepPosition, stepTo: plan.member.stepPosition, done: plan.member.state === "done",
  })) {
    await runAutomations({
      skipActionTypes: outboundSkip, type, tenantId, campaignId: c.id, outcome: input.outcome,
      leadId: res.leadId, companyId: m.companyId, personId: m.personId, companyName: m.company.name,
      fields: { company: m.company.name, campaign: c.slug, outcome: input.outcome, step_position: m.stepPosition, member_state: plan.member.state, message: input.notes ?? null },
    }).catch((err) => reportError("campaigns.recordOutcome.campaignAutomations", err, { campaignId: c.id, type }));
  }
  audit("campaign", c.id, "update", { member: m.id, state: m.state }, { member: m.id, state: plan.member.state, outcome: input.outcome, leadId: res.leadId }, auditOpts(ctx));
  return {
    ok: true as const,
    member: { id: m.id, state: plan.member.state, step_position: plan.member.stepPosition, attempts: plan.member.attempts, next_eligible_on: plan.member.nextEligibleOn },
    lead: res.leadId != null && plan.promote ? { id: res.leadId, created: res.created, stage: res.created ? plan.promote.stage : res.linked?.status ?? null, moved } : null,
    interaction_id: res.interactionId,
    suppressed: plan.suppress && Boolean(normalizeEmail(input.email ?? m.person?.email ?? null)),
    who,
  };
}


/** The company's campaign members waiting for a call now: queued, campaign running or paused, current step a call. */
export async function findCallableMembers(tenantId: number, companyId: number, skipCampaignId?: number) {
  const rows = await db.campaignMember.findMany({
    where: {
      tenantId, companyId, state: "queued", campaign: { status: { in: ["running", "paused"] } },
      ...(skipCampaignId != null ? { NOT: { campaignId: skipCampaignId } } : {}),
    },
    select: { id: true, stepPosition: true, personId: true, campaign: { select: { id: true, slug: true, steps: { select: { position: true, channel: true } } } } },
    orderBy: { id: "asc" },
  });
  return rows
    .filter((m) => m.campaign.steps.find((st) => st.position === m.stepPosition)?.channel === "call")
    .map((m) => ({ memberId: m.id, campaignId: m.campaign.id, slug: m.campaign.slug, personId: m.personId }));
}

/** The company's open lead (open, not converted, newest): the one lookup the call and campaign paths share. */
export function findOpenLead(client: { lead: Pick<typeof db.lead, "findFirst"> }, tenantId: number, companyId: number) {
  return client.lead.findFirst({
    where: { tenantId, companyId, outcome: "open", convertedDealId: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true },
  });
}

/**
 * A call already logged elsewhere (lead path, or the first campaign of a /calls tap) advances
 * every other campaign member of the company waiting for a call. Never throws: the call is
 * committed, a member that cannot move is reported. Returns how many moved.
 */
export async function advanceMembersForCall(ctx: CampaignCtx, companyId: number, outcome: CallOutcomeKey, now: Date = new Date(), skipCampaignId?: number): Promise<number> {
  let moved = 0;
  for (const m of await findCallableMembers(ctx.tenantId, companyId, skipCampaignId)) {
    const r = await recordOutcome(ctx, m.slug, { member_id: m.memberId, outcome }, now, { callAlreadyLogged: true })
      .catch((err: unknown) => ({ error: err instanceof Error ? err.message : String(err) }));
    if ("error" in r) reportError("campaigns.advanceMembersForCall", new Error(String(r.error)), { memberId: m.memberId });
    else moved += 1;
  }
  return moved;
}


// ---------------------------------------------------------------------------------------------
// Item 4: leads by stage (retargeting, nurture) and the e-mail step's drafts

/**
 * Load open leads in the campaign's chosen stages as members (dry run by default; apply is an
 * operator's, like a prospect load). One member per company; the batch id is the undo key.
 */
export async function loadLeadAudience(ctx: CampaignCtx, slug: string, input: { dry_run: boolean; batch: string }) {
  const c = await db.campaign.findFirst({
    where: { tenantId: ctx.tenantId, slug },
    select: { id: true, status: true, kind: true, audience: true, steps: { select: { position: true, channel: true, waitDays: true, audienceRule: true } } },
  });
  if (!c) return fail(404, "Kampány nem található");
  const aud = audienceOf(c.audience);
  if (aud.source !== "leads_by_stage" || aud.stages.length === 0) return fail(409, "A kampány közönsége nem leadek szakasz szerint");
  if (!MEMBER_KINDS.includes(c.kind as CampaignKind)) return fail(409, "Ez a kampánytípus csak tartalom, tagokat nem kap");
  if (c.status === "stopped" || c.status === "done") return fail(409, "Lezárt kampányhoz nem adható tag");
  if (c.steps.length === 0) return fail(409, "Előbb a lépéseket kell megadni (a tagok kezdő lépése ebből jön)");
  if (!input.dry_run) {
    const s = await needsOperator(ctx);
    if (s) return s;
  }
  const tenantId = ctx.tenantId;
  const [leads, existing] = await Promise.all([
    db.lead.findMany({
      where: { tenantId, outcome: "open", convertedDealId: null, status: { in: aud.stages }, companyId: { not: null }, company: { deletedAt: null } },
      orderBy: { createdAt: "asc" },
      select: { id: true, companyId: true, contact: { select: { personId: true, phone: true, email: true, person: { select: { phone: true, email: true } } } }, company: { select: { city: true } } },
    }),
    db.campaignMember.findMany({ where: { tenantId, campaignId: c.id }, select: { companyId: true } }),
  ]);
  const have = new Set(existing.map((m) => m.companyId));
  const rows: Prisma.CampaignMemberCreateManyInput[] = [];
  let alreadyMember = 0;
  for (const l of leads) {
    if (have.has(l.companyId!)) { alreadyMember++; continue; }
    have.add(l.companyId!);
    const k = l.contact;
    const start = startFor(c.steps as StepDef[], {
      hasEmail: isEmailAddress(k?.email) || isEmailAddress(k?.person?.email),
      hasPhone: Boolean(k?.phone || k?.person?.phone),
    });
    rows.push({
      tenantId, campaignId: c.id, companyId: l.companyId!, personId: k?.personId ?? null, leadId: l.id,
      stepPosition: start.stepPosition, state: start.state, city: l.company?.city ?? null, importBatch: input.batch,
    });
  }
  const summary = { leads: leads.length, add: rows.length, already_member: alreadyMember, needs_email: rows.filter((r) => r.state === "needs_email").length, needs_contact: rows.filter((r) => r.state === "needs_contact").length };
  if (input.dry_run) return { ok: true as const, dry_run: true, summary };
  await db.$transaction(async (tx) => {
    await lockCampaign(tx, c.id);
    if (rows.length) await tx.campaignMember.createMany({ data: rows, skipDuplicates: true });
    if (c.status !== "draft" && rows.length) await tx.campaign.update({ where: { id: c.id }, data: BACK_TO_DRAFT });
  });
  audit("campaign", c.id, "update", null, { leadAudience: { batch: input.batch, ...summary } }, auditOpts(ctx));
  return { ok: true as const, dry_run: false, summary };
}

/** The approval hash of a campaign as it stands now (same inputs as approveCampaign); compare with approvedHash. */
export async function approvalHashNow(
  tenantId: number,
  c: { id: number; dailyCap: number; outboundAutomations: boolean; audience: Prisma.JsonValue | null; steps: { position: number; channel: string; waitDays: number; audienceRule: string; contentItemId: number | null }[] },
) {
  const [members, variants] = await Promise.all([
    db.campaignMember.findMany({ where: { tenantId, campaignId: c.id }, select: { companyId: true } }),
    campaignVariants(tenantId, c.id),
  ]);
  return approvalHash({ memberCompanyIds: members.map((m) => m.companyId), steps: c.steps as (StepDef & { contentItemId: number | null })[], dailyCap: c.dailyCap, outboundAutomations: c.outboundAutomations, audience: audienceOf(c.audience), variants });
}

/**
 * The e-mail step's work for today: a DRAFT in the Outreach queue for each queued member on an
 * e-mail step whose wait is over, with the step's live asset as subject and body. Nothing is sent
 * here: the drafts go through the existing gated sender (approval, footer, suppression), and a
 * sent draft advances its member (advanceOnSent). At most the daily cap per run; once per member and step.
 */
export async function draftEmailStep(ctx: CampaignCtx, slug: string, now: Date = new Date()) {
  const s = needsSession(ctx);
  if (s) return s;
  const op = await needsOperator(ctx);
  if (op) return op;
  const tenantId = ctx.tenantId;
  const c = await db.campaign.findFirst({
    where: { tenantId, slug },
    select: { id: true, slug: true, status: true, dailyCap: true, startsOn: true, endsOn: true, audience: true, senderUserId: true, approvedHash: true, outboundAutomations: true, steps: { select: { position: true, channel: true, waitDays: true, audienceRule: true, contentItemId: true } } },
  });
  if (!c) return fail(404, "Kampány nem található");
  if (c.status !== "running") return fail(409, "Csak jóváhagyott, futó kampány e-mail lépése készít piszkozatot");
  // Drafted is what Áron approved: the approval hash over the same inputs as approveCampaign must still match,
  // so any drift (a variant restored or tagged after approval) waits for a re-approval (Vanda #195-1, r2-1).
  const hashNow = await approvalHashNow(tenantId, c);
  if (c.approvedHash == null || hashNow !== c.approvedHash) return fail(409, "A kampány változott a jóváhagyás óta (például egy szegmensváltozat); hagyd jóvá újra");
  // The cap is per day, not per click (Vanda #194-5).
  const madeToday = await db.emailDraft.count({ where: { tenantId, campaign: c.slug, createdAt: { gte: atLocal(localDay(now), 0) } } });
  const room = Math.max(0, c.dailyCap - madeToday);
  const today = localDay(now).key;
  const ymdKey = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
  if (!inWindow(ymdKey(c.startsOn), ymdKey(c.endsOn), today)) return { ok: true as const, drafted: 0, noAddress: 0, noAsset: 0, unresolved: 0 };
  const emailSteps = new Map(c.steps.filter((x) => x.channel === "email").map((x) => [x.position, x]));
  const members = (await db.campaignMember.findMany({
    where: { tenantId, campaignId: c.id, state: "queued", stepPosition: { in: [...emailSteps.keys()] }, company: { deletedAt: null } },
    orderBy: [{ priority: "asc" }, { id: "asc" }],
    select: {
      id: true, companyId: true, personId: true, stepPosition: true, nextEligibleOn: true, segment: true, lane: true, city: true,
      person: { select: { email: true, firstName: true, lastName: true } }, company: { select: { name: true, city: true } },
    },
  })).filter((m) => m.nextEligibleOn == null || m.nextEligibleOn.toISOString().slice(0, 10) <= today);
  // The same context and render as the preview: what Áron saw is what is drafted (live versions only).
  const ec = await emailContext(tenantId, c.id, c.senderUserId);
  const companyIds = members.map((m) => m.companyId);
  const [done, leads, contacts] = await Promise.all([
    db.emailDraft.findMany({ where: { tenantId, campaign: c.slug, companyId: { in: companyIds } }, select: { companyId: true, step: true, status: true } }),
    db.lead.findMany({ where: { tenantId, outcome: "open", convertedDealId: null, companyId: { in: companyIds } }, select: { companyId: true } }),
    db.contact.findMany({ where: { tenantId, endedAt: null, companyId: { in: companyIds } }, select: { companyId: true, personId: true, email: true, person: { select: { email: true } } } }),
  ]);
  const seen = new Set(done.map((x) => `${x.companyId}:${x.step}`));
  // A reply on any touch of this campaign, or (prospects) an open lead, ends the cold e-mails; a stage audience needs its lead open (Vanda #194-1).
  const repliedCo = new Set(done.filter((x) => x.status === "replied").map((x) => x.companyId));
  const openLead = new Set(leads.map((l) => l.companyId));
  const leadsAudience = audienceOf(c.audience).source === "leads_by_stage";
  let noAddress = 0, noAsset = 0, unresolved = 0;
  const data: Prisma.EmailDraftCreateManyInput[] = [];
  for (const m of members) {
    if (data.length >= room) break;
    if (seen.has(`${m.companyId}:${m.stepPosition}`) || repliedCo.has(m.companyId)) continue;
    if (leadsAudience ? !openLead.has(m.companyId) : openLead.has(m.companyId)) continue;
    const segment = segmentOf(m);
    const step = ec.steps.find((x) => x.position === m.stepPosition);
    const itemId = step ? pickAsset(step, ec.variants.get(m.stepPosition) ?? [], segment, true) : null;
    const asset = itemId != null ? ec.items.find((i) => i.id === itemId && i.status === "live" && i.liveVersion) : undefined;
    if (!asset) { noAsset++; continue; }
    const to = memberAddress(m, contacts);
    if (!to) { noAddress++; continue; }
    const r = renderEmail({ subject: asset.title, body: asset.liveVersion!.body }, valuesFor(m, segment, ec));
    const subject = renderedText(r.subject);
    const body = renderedText(r.body);
    // A field left open or a glued suffix never reaches a draft: the launch-tab check lists the member instead.
    if (subject == null || body == null || r.suffix.length) { unresolved++; continue; }
    data.push({ tenantId, companyId: m.companyId, personId: m.personId, campaign: c.slug, step: m.stepPosition, subject, body, toEmail: to, status: "draft", createdById: ctx.userId, templateVersionId: asset.liveVersion!.id });
  }
  if (data.length) await db.emailDraft.createMany({ data, skipDuplicates: true });
  audit("campaign", c.id, "update", null, { emailDrafts: data.length, noAddress, noAsset, unresolved }, auditOpts(ctx));
  return { ok: true as const, drafted: data.length, noAddress, noAsset, unresolved };
}

/**
 * A draft of this campaign went out through the gated sender (Resend or marked sent by hand):
 * advance its member exactly like POST .../outcome email_sent. No member on that step: nothing.
 */
export async function advanceOnSent(ctx: CampaignCtx, campaignSlug: string, companyId: number, step: number, now: Date = new Date()) {
  const c = await db.campaign.findFirst({ where: { tenantId: ctx.tenantId, slug: campaignSlug, status: { in: ["running", "paused"] } }, select: { id: true } });
  if (!c) return null;
  const m = await db.campaignMember.findFirst({ where: { tenantId: ctx.tenantId, campaignId: c.id, companyId, stepPosition: step, state: "queued" }, select: { id: true } });
  if (!m) return null;
  const r = await recordOutcome(ctx, campaignSlug, { member_id: m.id, outcome: "email_sent" }, now);
  // A refused advance (a race) is not thrown; report it so the member is not silently left behind (Vanda #194-9).
  if ("error" in r) reportError("campaigns.advanceOnSent", new Error(r.error), { campaignSlug, companyId, step });
  return r;
}

/**
 * Sending a draft of a member campaign needs that campaign running: one sent back to draft (an edit),
 * paused or stopped sends nothing from its queue (Vanda #194-2). Other campaign keys are untouched.
 */
export async function campaignSendBlock(tenantId: number, slug: string): Promise<string | null> {
  const c = await db.campaign.findFirst({ where: { tenantId, slug }, select: { kind: true, status: true } });
  if (!c || !MEMBER_KINDS.includes(c.kind as CampaignKind) || c.status === "running") return null;
  return `A kampány most nem fut (${c.status}); a piszkozata indítás után küldhető`;
}
