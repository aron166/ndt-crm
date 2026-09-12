"use server";

import { db } from "@/lib/db";
import { userLeadCtx } from "@/lib/actor";
import { proposeSlots, type SlotBooking } from "@/lib/booking/slots";
import { conflictsFor, DEFAULT_BOOKING_MINUTES } from "@/lib/booking/conflicts";
import { isBookingKind } from "@/lib/booking/priority";

const TENANT_ID = 1;
/** How far out Péter books (see slots.ts) plus a little slack for "no free day found". */
const PROPOSAL_WINDOW_DAYS = 21;

/**
 * "Javasolj időpontot" — route-checked slot suggestions for a lead's booking
 * (CallOutcomeModal). Tenant-scoped in every query; the ranking/overlap math
 * itself is the PURE lib/booking/* modules, this just feeds them real rows.
 */
export async function proposeBookingSlots(leadId: number, kind: string, minutes?: number) {
  const ctx = await userLeadCtx(TENANT_ID);
  if ("error" in ctx) return ctx;
  if (!isBookingKind(kind)) return { error: "Ismeretlen foglalás típus" };

  const lead = await db.lead.findFirst({
    where: { id: leadId, tenantId: TENANT_ID },
    select: { estimatedValue: true, company: { select: { lat: true, lng: true } } },
  });
  if (!lead) return { error: "Lead nem található" };

  const now = new Date();
  const windowEnd = new Date(now.getTime() + PROPOSAL_WINDOW_DAYS * 86_400_000);
  const rows = await db.task.findMany({
    where: {
      tenantId: TENANT_ID,
      startsAt: { gte: now, lt: windowEnd },
      status: { notIn: ["done", "cancelled"] },
    },
    select: {
      id: true, title: true, startsAt: true, estimatedMinutes: true, assignedToId: true, bookingKind: true,
      company: { select: { lat: true, lng: true } },
      lead: { select: { estimatedValue: true } },
      deal: { select: { value: true } },
    },
  });
  const titleById = new Map(rows.map((r) => [r.id, r.title]));

  const existing: SlotBooking[] = rows
    .filter((r): r is typeof r & { startsAt: Date } => r.startsAt !== null)
    .map((r) => ({
      id: r.id,
      startsAt: r.startsAt,
      minutes: r.estimatedMinutes,
      assignedToId: r.assignedToId,
      kind: r.bookingKind,
      dealValue: r.deal?.value != null ? Number(r.deal.value) : null,
      estimatedValue: r.lead?.estimatedValue != null ? Number(r.lead.estimatedValue) : null,
      point: r.company?.lat != null && r.company?.lng != null ? { lat: r.company.lat, lng: r.company.lng } : null,
    }));

  const target =
    lead.company?.lat != null && lead.company?.lng != null
      ? { lat: lead.company.lat, lng: lead.company.lng }
      : null;

  const proposals = proposeSlots({
    target,
    existing,
    from: now,
    minutes,
    days: PROPOSAL_WINDOW_DAYS,
    assignedToId: ctx.userId,
  });

  const candidateMinutes = minutes && minutes > 0 ? minutes : DEFAULT_BOOKING_MINUTES;
  const candidateEstimatedValue = lead.estimatedValue != null ? Number(lead.estimatedValue) : null;

  return {
    success: true as const,
    proposals: proposals.map((p) => {
      const conflicts = conflictsFor(
        {
          id: -1, startsAt: p.startsAt, minutes: candidateMinutes, assignedToId: ctx.userId,
          kind, estimatedValue: candidateEstimatedValue, dealValue: null,
        },
        existing,
      );
      return {
        startsAt: p.startsAt,
        nearestKm: p.nearestKm,
        reason: p.reason,
        conflicts: conflicts.map((c) => {
          const other = c.keep.id === -1 ? c.bump : c.keep;
          return {
            otherTitle: titleById.get(other.id) ?? `Foglalás #${other.id}`,
            otherStartsAt: other.startsAt,
            overlapMinutes: c.overlapMinutes,
            // "new" = the booking we're about to create is the lower-priority
            // (bumpable) side; "other" = the existing booking is.
            movable: c.bump.id === -1 ? ("new" as const) : ("other" as const),
          };
        }),
      };
    }),
  };
}
