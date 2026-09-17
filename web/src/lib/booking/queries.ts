import { z } from "zod";
import { db } from "@/lib/db";
import type { SlotBooking } from "./slots";

/**
 * Who holds the demo for `demo_with` (PR #97 finding 3): the booking task goes
 * to THAT user's calendar, not to whoever logged the call.
 *
 * Tenant config, `tenants.settings.demoHosts` = `{ "aron": <users.id>, "peter": <users.id> }`.
 * ponytail: no editor for this yet — two people, set once by a pg script. Add a
 * /leads/setup field when a third demo host appears.
 */
const demoHostsSchema = z.object({ aron: z.number().int().positive(), peter: z.number().int().positive() }).partial();
export type DemoHosts = z.infer<typeof demoHostsSchema>;

export function demoHostsFromSettings(settings: unknown): DemoHosts {
  const parsed = demoHostsSchema.safeParse((settings as { demoHosts?: unknown } | null)?.demoHosts);
  return parsed.success ? parsed.data : {};
}

/** The host's users.id, verified to be a user of this tenant; null when unconfigured. */
export async function resolveDemoHost(tenantId: number, demoWith: "aron" | "peter"): Promise<number | null> {
  const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
  const id = demoHostsFromSettings(tenant?.settings)[demoWith];
  if (id == null) return null;
  const user = await db.user.findFirst({ where: { id, tenantId }, select: { id: true } });
  return user?.id ?? null;
}

export interface LoadedBooking extends SlotBooking {
  title: string;
}

/**
 * Open bookings (tasks with starts_at) of ONE user in [from, to). Per-user on
 * purpose (finding 9): availability and "am I already in that area that day"
 * are both questions about one person's day.
 */
export async function loadBookings(
  tenantId: number,
  assignedToId: number,
  from: Date,
  to: Date,
  excludeTaskId?: number,
): Promise<LoadedBooking[]> {
  const rows = await db.task.findMany({
    where: {
      tenantId,
      assignedToId,
      startsAt: { gte: from, lt: to },
      status: { notIn: ["done", "cancelled"] },
      ...(excludeTaskId != null ? { id: { not: excludeTaskId } } : {}),
    },
    select: {
      id: true, title: true, startsAt: true, estimatedMinutes: true, assignedToId: true, bookingKind: true,
      company: { select: { lat: true, lng: true } },
      lead: { select: { estimatedValue: true } },
      deal: { select: { value: true } },
    },
  });
  return rows
    .filter((r): r is typeof r & { startsAt: Date } => r.startsAt !== null)
    .map((r) => ({
      id: r.id,
      title: r.title,
      startsAt: r.startsAt,
      minutes: r.estimatedMinutes,
      assignedToId: r.assignedToId,
      kind: r.bookingKind,
      dealValue: r.deal?.value != null ? Number(r.deal.value) : null,
      estimatedValue: r.lead?.estimatedValue != null ? Number(r.lead.estimatedValue) : null,
      point: r.company?.lat != null && r.company?.lng != null ? { lat: r.company.lat, lng: r.company.lng } : null,
    }));
}
