import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audienceWhere } from "@/lib/marketing/audience-query";

// Outreach defaults (2026-09-20). campaigns.slug IS the outreach campaign key
// stored as a free string in email_drafts.campaign / leads.campaign /
// interactions.campaign - no FK, no data migration. A campaign row is
// OPTIONAL: campaignBySlug returning null means "legacy free-string key,
// behave as before" - the targets route, the drafts route and the dashboard
// must all fall back to today's behaviour exactly when that happens.

export interface CampaignRegistration {
  id: number;
  name: string;
  slug: string;
  senderUserId: number | null;
  currentWave: number | null;
  audienceViewId: number | null;
  isArchived: boolean;
}

export async function campaignBySlug(tenantId: number, slug: string): Promise<CampaignRegistration | null> {
  return db.campaign.findFirst({
    where: { tenantId, slug },
    select: {
      id: true, name: true, slug: true,
      senderUserId: true, currentWave: true, audienceViewId: true, isArchived: true,
    },
  });
}

/**
 * §6c: N distinct campaign keys in ONE query instead of N. An absent slug
 * simply has no entry in the returned Map - callers read that exactly like a
 * campaignBySlug null (legacy free-string key, no fallback).
 */
export async function campaignsBySlugs(tenantId: number, slugs: string[]): Promise<Map<string, CampaignRegistration>> {
  if (slugs.length === 0) return new Map();
  const rows = await db.campaign.findMany({
    where: { tenantId, slug: { in: slugs } },
    select: {
      id: true, name: true, slug: true,
      senderUserId: true, currentWave: true, audienceViewId: true, isArchived: true,
    },
  });
  return new Map(rows.map((r) => [r.slug, r]));
}

export type AudienceResolution =
  | { kind: "none" }
  | { kind: "missing"; viewId: number }
  | { kind: "ok"; viewId: number; name: string; isArchived: boolean; where: Prisma.CompanyWhereInput };

/**
 * The one place that decides what a campaign's audience restriction resolves
 * to. "missing" (view set but gone) must be told apart from "none" (never had
 * one) - a restriction that disappears has to be louder than one that never
 * existed, and every caller reads this instead of doing the savedView lookup
 * itself so that decision can't drift between callers.
 */
export async function resolveAudience(tenantId: number, reg: CampaignRegistration | null): Promise<AudienceResolution> {
  if (reg?.audienceViewId == null) return { kind: "none" };
  const view = await db.savedView.findFirst({
    where: { id: reg.audienceViewId, tenantId },
    select: { id: true, name: true, filters: true },
  });
  if (!view) return { kind: "missing", viewId: reg.audienceViewId };
  return {
    kind: "ok",
    viewId: view.id,
    name: view.name,
    isArchived: reg.isArchived,
    where: await audienceWhere(view.filters, tenantId),
  };
}

/**
 * What to stamp on a NEWLY CREATED draft when the payload left the field
 * undefined. Payload-stated (including explicit null) always wins; the
 * registration only fills the gap left by "not stated". No registration
 * means no fallback - a legacy key behaves exactly as before.
 */
export function outreachDefaults(
  reg: CampaignRegistration | null,
  payload: { senderUserId?: number | null; wave?: number | null },
): { senderUserId?: number | null; wave?: number | null } {
  return {
    ...(payload.senderUserId !== undefined
      ? { senderUserId: payload.senderUserId }
      : reg?.senderUserId != null ? { senderUserId: reg.senderUserId } : {}),
    ...(payload.wave !== undefined
      ? { wave: payload.wave }
      : reg?.currentWave != null ? { wave: reg.currentWave } : {}),
  };
}
