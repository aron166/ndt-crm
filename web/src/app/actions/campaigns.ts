"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { getActor, NOT_A_CRM_USER } from "@/lib/actor";

// A campaign row is the ONE campaign identity: the marketing content queue AND
// the cold-email batch. `slug` is the key stored in email_drafts.campaign /
// leads.campaign / interactions.campaign.
//
// Every action checks the CRM user itself. A server action is callable by id,
// so the (app) layout's login redirect is not an authorization check. These
// four had no check at all before 2026-09-20.

const TENANT_ID = 1;

/**
 * Every action returns this one shape. Declared, not inferred: the callers read
 * `res.error` and `res.id` off the value directly, which a union of disjoint
 * object literals does not allow.
 */
type CampaignResult = { error?: string; success?: true; id?: number; slug?: string };

async function requireUser(): Promise<{ error: string } | null> {
  const { userId } = await getActor(TENANT_ID);
  return userId == null ? { error: NOT_A_CRM_USER } : null;
}

function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

/** A tenant-unique slug: base, then base-2, base-3… (the table enforces uniqueness). */
async function uniqueSlug(base: string): Promise<string> {
  const root = base || "kampany";
  const taken = new Set(
    (await db.campaign.findMany({
      where: { tenantId: TENANT_ID, slug: { startsWith: root } },
      select: { slug: true },
    })).map((c) => c.slug),
  );
  if (!taken.has(root)) return root;
  for (let i = 2; ; i++) {
    const candidate = `${root}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * The outreach key as it is actually stored, when one equal to `typed` apart
 * from case already exists on a draft. Returns null when the key is new, in
 * which case the caller slugifies as usual. Only drafts are consulted: they
 * are the rows whose `campaign` value a campaign has to match to mean anything.
 */
async function existingOutreachKey(typed: string): Promise<string | null> {
  const row = await db.emailDraft.findFirst({
    where: { tenantId: TENANT_ID, campaign: { equals: typed, mode: "insensitive" } },
    select: { campaign: true },
  });
  if (!row) return null;
  const taken = await db.campaign.findFirst({
    where: { tenantId: TENANT_ID, slug: row.campaign },
    select: { id: true },
  });
  // Already adopted by another campaign: fall through to the normal path
  // rather than throwing a raw unique violation out of the action.
  return taken ? null : row.campaign;
}

function revalidate(id?: number) {
  revalidatePath("/marketing/campaigns");
  if (id) revalidatePath(`/marketing/campaigns/${id}`);
}

/**
 * Outreach fields shared by create and setCampaignOutreach. `wave` is capped
 * at 52 to match setCampaignTarget in actions/outreach-campaigns.ts: the two
 * write the same concept and must not disagree on what a valid wave is.
 */
const outreachSchema = z.object({
  senderUserId: z.number().int().positive().nullable().optional(),
  currentWave: z.number().int().min(1).max(52).nullable().optional(),
});

/** A sender must be a user of THIS tenant; anything else is refused, not dropped. */
async function checkSender(senderUserId: number | null | undefined): Promise<string | null> {
  if (senderUserId == null) return null;
  const u = await db.user.findFirst({ where: { id: senderUserId, tenantId: TENANT_ID }, select: { id: true } });
  return u ? null : "Felhasználó nem található";
}

export async function createCampaign(input: {
  name: string;
  description?: string;
  /** The outreach key. Free-form so an existing key can be adopted; slugified and de-duped. */
  slug?: string;
  senderUserId?: number | null;
  currentWave?: number | null;
}): Promise<CampaignResult> {
  const denied = await requireUser();
  if (denied) return denied;

  const name = input.name?.trim();
  if (!name) return { error: "A kampány neve kötelező" };

  const outreach = outreachSchema.safeParse(input);
  if (!outreach.success) return { error: "Érvénytelen adat" };
  const senderError = await checkSender(outreach.data.senderUserId);
  if (senderError) return { error: senderError };

  // An explicit slug is slugified: it becomes the campaign key written into
  // email_drafts.campaign, and a key with a space or a slash would be a URL and
  // query-param hazard on every outreach screen.
  //
  // The exception is adoption. Slugs compare case-sensitively in Postgres, so
  // slugifying "TESZT" to "teszt" would bind the campaign to nothing: the 8
  // drafts already carrying "TESZT" would keep no sender and no wave, and the
  // dashboard picker would list TESZT and teszt as two campaigns. When the
  // typed key already exists as an outreach key, adopt it verbatim.
  const typed = input.slug?.trim();
  const adopted = typed ? await existingOutreachKey(typed) : null;
  const slug = adopted ?? (await uniqueSlug(slugify(typed || name)));
  const data = {
    tenantId: TENANT_ID,
    name,
    slug,
    description: input.description?.trim() || null,
    senderUserId: outreach.data.senderUserId ?? null,
    currentWave: outreach.data.currentWave ?? null,
  };
  // uniqueSlug reads then writes, so two creates of the same name in the same
  // moment can both resolve the same candidate. The table is the real arbiter;
  // the loser retries once instead of throwing P2002 into the error boundary.
  let campaign: { id: number };
  try {
    campaign = await db.campaign.create({ data, select: { id: true } });
  } catch {
    const retrySlug = await uniqueSlug(slugify(typed || name));
    data.slug = retrySlug;
    campaign = await db.campaign.create({ data, select: { id: true } });
  }
  audit("campaign", campaign.id, "create", null,
    { name, slug: data.slug, senderUserId: data.senderUserId, currentWave: data.currentWave });
  revalidate(campaign.id);
  return { success: true, id: campaign.id, slug: data.slug };
}

/**
 * The two values stamped on NEW drafts of this campaign whose payload omits
 * them (POST /api/outreach/drafts). Changing them never rewrites a draft that
 * already exists. History and rows already queued keep what they were given.
 */
export async function setCampaignOutreach(id: number, input: {
  senderUserId?: number | null;
  currentWave?: number | null;
}): Promise<CampaignResult> {
  const denied = await requireUser();
  if (denied) return denied;

  const campaign = await db.campaign.findFirst({
    where: { id, tenantId: TENANT_ID },
    select: { id: true, senderUserId: true, currentWave: true },
  });
  if (!campaign) return { error: "Kampány nem található" };

  const parsed = outreachSchema.safeParse(input);
  if (!parsed.success) return { error: "Érvénytelen adat" };
  const senderError = await checkSender(parsed.data.senderUserId);
  if (senderError) return { error: senderError };

  const data: { senderUserId?: number | null; currentWave?: number | null } = {};
  if (parsed.data.senderUserId !== undefined) data.senderUserId = parsed.data.senderUserId;
  if (parsed.data.currentWave !== undefined) data.currentWave = parsed.data.currentWave;
  if (Object.keys(data).length === 0) return { success: true };

  await db.campaign.update({ where: { id }, data });
  audit("campaign", id, "update",
    { senderUserId: campaign.senderUserId, currentWave: campaign.currentWave }, data);
  revalidate(id);
  return { success: true };
}

export async function updateCampaign(id: number, input: { name: string; description?: string }): Promise<CampaignResult> {
  const denied = await requireUser();
  if (denied) return denied;

  const campaign = await db.campaign.findFirst({
    where: { id, tenantId: TENANT_ID },
    select: { id: true, name: true, description: true },
  });
  if (!campaign) return { error: "Kampány nem található" };

  const name = input.name?.trim();
  if (!name) return { error: "A kampány neve kötelező" };
  const description = input.description?.trim() || null;

  await db.campaign.update({ where: { id }, data: { name, description } });
  audit("campaign", id, "update",
    { name: campaign.name, description: campaign.description },
    { name, description },
  );
  revalidate(id);
  return { success: true };
}

/** Set (or clear, when viewId is null) the campaign's target audience segment. */
export async function setCampaignAudience(id: number, viewId: number | null): Promise<CampaignResult> {
  const denied = await requireUser();
  if (denied) return denied;

  const campaign = await db.campaign.findFirst({
    where: { id, tenantId: TENANT_ID },
    select: { id: true, audienceViewId: true },
  });
  if (!campaign) return { error: "Kampány nem található" };

  if (viewId !== null) {
    // Only a COMPANY saved view of the same tenant can be an audience.
    const view = await db.savedView.findFirst({
      where: { id: viewId, tenantId: TENANT_ID, entityType: "company" },
      select: { id: true },
    });
    if (!view) return { error: "A kiválasztott szegmens nem érvényes" };
  }

  await db.campaign.update({ where: { id }, data: { audienceViewId: viewId } });
  audit("campaign", id, "update",
    { audienceViewId: campaign.audienceViewId },
    { audienceViewId: viewId },
  );
  revalidate(id);
  return { success: true };
}

export async function setCampaignArchived(id: number, isArchived: boolean): Promise<CampaignResult> {
  const denied = await requireUser();
  if (denied) return denied;

  const campaign = await db.campaign.findFirst({
    where: { id, tenantId: TENANT_ID },
    select: { id: true, isArchived: true },
  });
  if (!campaign) return { error: "Kampány nem található" };

  await db.campaign.update({ where: { id }, data: { isArchived } });
  audit("campaign", id, "update", { isArchived: campaign.isArchived }, { isArchived });
  revalidate(id);
  return { success: true };
}
