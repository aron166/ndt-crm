import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { reportError } from "@/lib/report-error";
import { audit } from "@/lib/audit";
import { serializeDates } from "@/lib/serialize";
import { json, leadApiCtx, parseLeadId, readJson, leadPatchSchema, LEAD_API_SELECT } from "@/lib/leads/api";
import { changeLeadStatus, setLeadOutcome, assignLead } from "@/lib/leads/service";

type Params = { params: Promise<{ id: string }> };

/** GET /api/leads/:id — lead + person + company + recent interactions + open tasks. */
export async function GET(request: Request, { params }: Params) {
  const auth = await leadApiCtx(request);
  if ("res" in auth) return auth.res;
  const id = parseLeadId((await params).id);
  if (id == null) return json({ error: "Invalid id" }, 400);
  const { tenantId } = auth.ctx;

  const lead = await db.lead.findFirst({ where: { id, tenantId }, select: LEAD_API_SELECT });
  if (!lead) return json({ error: "Not found" }, 404);

  const [interactions, openTasks] = await Promise.all([
    db.interaction.findMany({
      where: { tenantId, leadId: id },
      select: { id: true, type: true, direction: true, outcome: true, notes: true, occurredAt: true, userId: true },
      orderBy: { occurredAt: "desc" },
      take: 50,
    }),
    db.task.findMany({
      where: { tenantId, leadId: id, status: { in: ["created", "in_progress"] } },
      select: { id: true, title: true, type: true, status: true, dueDate: true, assignedToId: true },
      orderBy: { dueDate: "asc" },
      take: 20,
    }),
  ]);
  return json({ ok: true, lead: serializeDates({ ...lead, interactions, openTasks }) });
}

/** PATCH /api/leads/:id — status | outcome (+lost_reason) | assigned_to_id | custom_fields merge. */
export async function PATCH(request: Request, { params }: Params) {
  const auth = await leadApiCtx(request);
  if ("res" in auth) return auth.res;
  const id = parseLeadId((await params).id);
  if (id == null) return json({ error: "Invalid id" }, 400);
  const { ctx } = auth;

  const raw = await readJson(request);
  if (raw instanceof Response) return raw;
  const parsed = leadPatchSchema.safeParse(raw);
  if (!parsed.success) return json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
  const body = parsed.data;

  const exists = await db.lead.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { customFields: true } });
  if (!exists) return json({ error: "Not found" }, 404);

  try {
    // Order matters: assign + custom fields first (cheap), then status, then
    // outcome (won runs the deal conversion — last, so a bad status 400s first).
    if (body.assigned_to_id !== undefined) {
      const r = await assignLead(id, body.assigned_to_id, ctx);
      if ("error" in r) return json({ error: r.error }, 400);
    }
    if (body.custom_fields) {
      const before = (exists.customFields ?? {}) as Record<string, unknown>;
      const merged: Record<string, unknown> = { ...before };
      for (const [k, v] of Object.entries(body.custom_fields)) {
        if (v === null) delete merged[k]; else merged[k] = v;
      }
      await db.lead.updateMany({ where: { id, tenantId: ctx.tenantId }, data: { customFields: merged as Prisma.InputJsonValue } });
      audit("lead", id, "update", { customFields: before }, { customFields: merged },
        { tenantId: ctx.tenantId, actor: "agent", actorAgentId: ctx.actorAgentId });
    }
    if (body.status !== undefined) {
      const r = await changeLeadStatus(id, body.status, ctx);
      if ("error" in r) return json({ error: r.error }, 400);
    }
    if (body.outcome !== undefined) {
      const r = await setLeadOutcome(id, body.outcome, ctx, body.lost_reason);
      if ("error" in r) return json({ error: r.error }, 400);
    }
  } catch (err) {
    reportError("api.leads.patch", err, { leadId: id, sourceApp: ctx.actorAgentId });
    return json({ error: "Internal error" }, 500);
  }

  const lead = await db.lead.findFirst({ where: { id, tenantId: ctx.tenantId }, select: LEAD_API_SELECT });
  return json({ ok: true, lead: serializeDates(lead) });
}
