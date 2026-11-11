import { z } from "zod";
import { db } from "@/lib/db";
import { json, leadApiCtx, parseLeadId } from "@/lib/leads/api";
import { serializeDates } from "@/lib/serialize";
import { leadSite, proposeSlotsFor } from "@/lib/booking/route-service";
import { isBookingKind } from "@/lib/booking/priority";

const querySchema = z.object({
  days: z.coerce.number().int().min(1).max(60).optional(),
  count: z.coerce.number().int().min(1).max(20).optional(),
  kind: z.string().refine(isBookingKind, "Unknown booking kind").optional(),
  wanted: z.coerce.date().optional(),
});

/**
 * GET /api/leads/:id/slots?days=&count=&kind=&wanted= (app key, read only): the same ranked,
 * feasible slots the booking drawer shows, for the lead's site (stated postcode, else the
 * company address, flagged site_assumed). Wall-clock is Budapest (lib/booking/time.ts),
 * independent of the server timezone. Books nothing.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await leadApiCtx(request);
  if ("res" in auth) return auth.res;
  const id = parseLeadId((await params).id);
  if (id == null) return json({ error: "Invalid id" }, 400);
  const raw = Object.fromEntries([...new URL(request.url).searchParams].filter(([, v]) => v.trim() !== ""));
  const q = querySchema.safeParse(raw);
  if (!q.success) return json({ error: "Validation failed", details: q.error.flatten() }, 400);
  const { tenantId } = auth.ctx;
  const lead = await db.lead.findFirst({ where: { id, tenantId }, select: { id: true } });
  if (!lead) return json({ error: "Not found" }, 404);
  const site = await leadSite(tenantId, id);
  const r = await proposeSlotsFor(tenantId, {
    settlementId: site?.settlement?.id ?? null,
    ...(site?.source ? { siteSource: site.source } : {}),
    kind: q.data.kind ?? null,
    days: q.data.days, count: q.data.count, wanted: q.data.wanted,
  });
  if ("error" in r) return json({ error: r.error }, r.status);
  return json({ ok: true, siteSource: site?.source ?? null, ...serializeDates(r) });
}
