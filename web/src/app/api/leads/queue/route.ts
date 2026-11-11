import { z } from "zod";
import { json, leadApiCtx } from "@/lib/leads/api";
import { serializeDates } from "@/lib/serialize";
import { getQueueRows, groupKey } from "@/app/(app)/leads/queue/queue-data";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  assigned_to: z.coerce.number().int().positive().optional(),
});

/**
 * GET /api/leads/queue?limit=&assigned_to= (app key): the hívólista, in the CRM's own
 * order (next_due ascending, no due date last, then oldest), each row with its group.
 */
export async function GET(request: Request) {
  const auth = await leadApiCtx(request);
  if ("res" in auth) return auth.res;
  const raw = Object.fromEntries([...new URL(request.url).searchParams].filter(([, v]) => v.trim() !== ""));
  const q = querySchema.safeParse(raw);
  if (!q.success) return json({ error: "Validation failed", details: q.error.flatten() }, 400);
  const now = new Date();
  const rows = await getQueueRows(q.data.assigned_to ?? null, auth.ctx.tenantId, q.data.limit);
  return json({ ok: true, items: serializeDates(rows.map((r) => ({ ...r, group: groupKey(r.nextDue, now) }))) });
}
