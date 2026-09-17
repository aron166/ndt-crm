"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { userLeadCtx } from "@/lib/actor";
import { proposeSlots } from "@/lib/booking/slots";
import { resolveDemoHost, loadBookings } from "@/lib/booking/queries";

const TENANT_ID = 1;
/** How far out Péter books (see slots.ts) plus a little slack for "no free day found". */
const PROPOSAL_WINDOW_DAYS = 21;

const argsSchema = z.object({
  leadId: z.number().int().positive(),
  demoWith: z.enum(["aron", "peter"]),
  minutes: z.number().int().min(15).max(600).optional(),
});

/**
 * "Javasolj időpontot" — route-checked slot suggestions for a lead's booking
 * (CallOutcomeModal). Tenant-scoped in every query; the ranking/overlap math
 * itself is the PURE lib/booking/* modules, this just feeds them real rows.
 */
export async function proposeBookingSlots(leadId: number, demoWith: string, minutes?: number) {
  const ctx = await userLeadCtx(TENANT_ID);
  if ("error" in ctx) return ctx;

  const parsed = argsSchema.safeParse({ leadId, demoWith, minutes });
  if (!parsed.success) return { error: "Érvénytelen adat" };

  const hostId = await resolveDemoHost(TENANT_ID, parsed.data.demoWith);
  if (hostId == null) return { error: "Nincs beállítva, ki tartja a demót" };

  const lead = await db.lead.findFirst({
    where: { id: leadId, tenantId: TENANT_ID },
    select: { company: { select: { lat: true, lng: true } } },
  });
  if (!lead) return { error: "Lead nem található" };

  // No same-day proposals: earliest slot is the start of tomorrow, server-local.
  const from = new Date();
  from.setDate(from.getDate() + 1);
  from.setHours(0, 0, 0, 0);
  const windowEnd = new Date(from.getTime() + PROPOSAL_WINDOW_DAYS * 86_400_000);

  const existing = await loadBookings(TENANT_ID, hostId, from, windowEnd);

  const target =
    lead.company?.lat != null && lead.company?.lng != null
      ? { lat: lead.company.lat, lng: lead.company.lng }
      : null;

  const proposals = proposeSlots({
    target,
    existing,
    from,
    minutes: parsed.data.minutes,
    days: PROPOSAL_WINDOW_DAYS,
    assignedToId: hostId,
  });

  return {
    success: true as const,
    proposals: proposals.map((p) => ({
      startsAt: p.startsAt,
      nearestKm: p.nearestKm,
      reason: p.reason,
    })),
  };
}
