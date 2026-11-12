// Campaign analytics (v2.7): audience, needs contact, touched, replied, promoted to lead,
// booked, declined, unreachable; split by step and by Budapest day. `aggregate` is pure and
// tested; `campaignAnalytics` loads the rows (members, the append-only campaign_events, the
// promoted leads) and calls it. Computed on read: no counter can go stale.

import { db } from "@/lib/db";
import { localDay } from "@/lib/booking/time";

export const REPLY_OUTCOMES: readonly string[] = ["reply_positive", "reply_negative", "unsubscribe"];
export const PROMOTING_OUTCOMES: readonly string[] = ["interested", "wants", "reply_positive"];
/** A lead counts as booked when a meeting is on or behind it: these stages, or won. qualified and offer_sent alone are not a booking. */
const BOOKED_STAGES: readonly string[] = ["discovery_booked", "demo_booked", "demo_done", "ordered", "won"];

export interface AggMember { id: number; state: string; leadId: number | null }
export interface AggEvent { memberId: number; stepPosition: number; outcome: string; at: Date }
export interface AggLead { id: number; status: string | null; outcome: string }

export interface StepStats { step: number; touched: number; replied: number; promoted: number }
export interface DayStats { day: string; touches: number; replies: number; promoted: number }
export interface CampaignStatsV2 {
  audience: number; needsContact: number; needsEmail: number; touched: number; replied: number; promoted: number; booked: number;
  declined: number; unreachable: number; byStep: StepStats[]; byDay: DayStats[];
}

export function isBooked(l: AggLead): boolean {
  // shortcut: a lead lost after its booking no longer counts; read lead_status_history if that matters.
  return l.outcome === "won" || (l.status != null && BOOKED_STAGES.includes(l.status));
}

/** Provider receipts (Resend webhook): recorded, but not touches. */
export const DELIVERY_OUTCOMES: readonly string[] = ["email_delivered", "email_opened"];

export function aggregate(members: readonly AggMember[], events: readonly AggEvent[], leads: readonly AggLead[]): CampaignStatsV2 {
  const leadById = new Map(leads.map((l) => [l.id, l]));
  const touched = new Set<number>();
  const replied = new Set<number>();
  const steps = new Map<number, { touched: Set<number>; replied: Set<number>; promoted: Set<number> }>();
  const days = new Map<string, DayStats>();
  for (const e of events) {
    if (e.outcome === "note_only" || DELIVERY_OUTCOMES.includes(e.outcome)) continue; // a note or a delivery receipt is not a touch
    touched.add(e.memberId);
    const s = steps.get(e.stepPosition) ?? { touched: new Set(), replied: new Set(), promoted: new Set() };
    s.touched.add(e.memberId);
    const day = localDay(e.at).key;
    const d = days.get(day) ?? { day, touches: 0, replies: 0, promoted: 0 };
    d.touches++;
    if (REPLY_OUTCOMES.includes(e.outcome)) { replied.add(e.memberId); s.replied.add(e.memberId); d.replies++; }
    if (PROMOTING_OUTCOMES.includes(e.outcome)) { s.promoted.add(e.memberId); d.promoted++; }
    steps.set(e.stepPosition, s);
    days.set(day, d);
  }
  const promotedMembers = members.filter((m) => m.leadId != null);
  return {
    audience: members.length,
    needsContact: members.filter((m) => m.state === "needs_contact").length,
    needsEmail: members.filter((m) => m.state === "needs_email").length,
    touched: touched.size,
    replied: replied.size,
    promoted: promotedMembers.length,
    booked: promotedMembers.filter((m) => { const l = leadById.get(m.leadId!); return l ? isBooked(l) : false; }).length,
    declined: members.filter((m) => m.state === "declined").length,
    unreachable: members.filter((m) => m.state === "unreachable").length,
    byStep: [...steps.entries()].sort((a, b) => a[0] - b[0]).map(([step, s]) => ({ step, touched: s.touched.size, replied: s.replied.size, promoted: s.promoted.size })),
    byDay: [...days.values()].sort((a, b) => a.day.localeCompare(b.day)),
  };
}

/** Stats for one campaign, or for every running one when `slug` is omitted (the analytics strip). */
export async function campaignAnalytics(tenantId: number, opts: { slug?: string; from?: Date; to?: Date } = {}) {
  const campaigns = await db.campaign.findMany({
    where: { tenantId, ...(opts.slug ? { slug: opts.slug } : { status: "running" }) },
    select: { id: true, slug: true, name: true, kind: true, status: true, dailyCap: true },
    orderBy: { createdAt: "desc" },
  });
  if (campaigns.length === 0) return [];
  const ids = campaigns.map((c) => c.id);
  const at = opts.from || opts.to ? { ...(opts.from ? { gte: opts.from } : {}), ...(opts.to ? { lt: opts.to } : {}) } : undefined;
  const [members, events] = await Promise.all([
    db.campaignMember.findMany({ where: { tenantId, campaignId: { in: ids } }, select: { id: true, campaignId: true, state: true, leadId: true } }),
    db.campaignEvent.findMany({ where: { tenantId, campaignId: { in: ids }, ...(at ? { at } : {}) }, select: { campaignId: true, memberId: true, stepPosition: true, outcome: true, at: true } }),
  ]);
  const leadIds = members.map((m) => m.leadId).filter((v): v is number => v != null);
  const leads = leadIds.length ? await db.lead.findMany({ where: { tenantId, id: { in: leadIds } }, select: { id: true, status: true, outcome: true } }) : [];
  return campaigns.map((c) => ({
    campaign: c,
    stats: aggregate(members.filter((m) => m.campaignId === c.id), events.filter((e) => e.campaignId === c.id), leads),
  }));
}
