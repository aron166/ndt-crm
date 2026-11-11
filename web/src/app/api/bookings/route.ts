import { z } from "zod";
import { db } from "@/lib/db";
import { json, leadApiCtx } from "@/lib/leads/api";
import { serializeDates } from "@/lib/serialize";

const MAX_RANGE_DAYS = 62;
const MAX_ROWS = 500;
const querySchema = z
  .object({
    from: z.coerce.date(),
    to: z.coerce.date(),
    assigned_to: z.coerce.number().int().positive().optional(),
  })
  .refine((q) => q.to > q.from, { message: "to must be after from", path: ["to"] })
  .refine((q) => q.to.getTime() - q.from.getTime() <= MAX_RANGE_DAYS * 86_400_000, { message: `range at most ${MAX_RANGE_DAYS} days`, path: ["to"] });

/**
 * GET /api/bookings?from=&to=&assigned_to= (app key, read only): open bookings (tasks with
 * starts_at, not done or cancelled) starting in [from, to), oldest first, with site, machine
 * and the lead's note. The same rows loadBookings and the route timeline read.
 */
export async function GET(request: Request) {
  const auth = await leadApiCtx(request);
  if ("res" in auth) return auth.res;
  const raw = Object.fromEntries([...new URL(request.url).searchParams].filter(([, v]) => v.trim() !== ""));
  const q = querySchema.safeParse(raw);
  if (!q.success) return json({ error: "Validation failed", details: q.error.flatten() }, 400);
  const { from, to, assigned_to } = q.data;
  const rows = await db.task.findMany({
    where: {
      tenantId: auth.ctx.tenantId,
      startsAt: { gte: from, lt: to },
      status: { notIn: ["done", "cancelled"] },
      ...(assigned_to ? { assignedToId: assigned_to } : {}),
    },
    select: {
      id: true, title: true, description: true, type: true, status: true, startsAt: true, estimatedMinutes: true,
      bookingKind: true, siteAddress: true, siteSource: true,
      siteSettlement: { select: { id: true, name: true, county: true } },
      equipment: { select: { id: true, name: true } },
      assignedTo: { select: { id: true, name: true } },
      company: { select: { id: true, name: true, city: true, address: true } },
      lead: { select: { id: true, message: true, nextAction: true } },
    },
    orderBy: { startsAt: "asc" },
    take: MAX_ROWS + 1,
  });
  return json({ ok: true, items: serializeDates(rows.slice(0, MAX_ROWS)), truncated: rows.length > MAX_ROWS });
}
