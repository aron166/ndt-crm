import { db } from "@/lib/db";

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
