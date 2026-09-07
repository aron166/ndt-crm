import { reportError } from "@/lib/report-error";
import { json, leadApiCtx, parseLeadId, readJson, leadInteractionWireSchema, toCallOutcomeInput } from "@/lib/leads/api";
import { logLeadCallOutcome } from "@/lib/leads/service";

/**
 * POST /api/leads/:id/interactions — log a call outcome. Same payload + rules
 * as the UI modal ("Hívás eredménye"): the shared logLeadCallOutcome validates
 * (note required; callback needs callback_at; meeting needs demo_with) and
 * applies the stage / task / lost transitions.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await leadApiCtx(request);
  if ("res" in auth) return auth.res;
  const id = parseLeadId((await params).id);
  if (id == null) return json({ error: "Invalid id" }, 400);

  const raw = await readJson(request);
  if (raw instanceof Response) return raw;
  const wire = leadInteractionWireSchema.safeParse(raw);
  if (!wire.success) return json({ error: "Validation failed", details: wire.error.flatten() }, 400);

  try {
    const res = await logLeadCallOutcome(id, toCallOutcomeInput(wire.data), auth.ctx);
    if ("error" in res) {
      const notFound = res.error === "Lead nem található";
      return json({ error: res.error, ...("issues" in res ? { details: res.issues } : {}) }, notFound ? 404 : 400);
    }
    const { success: _s, ...rest } = res;
    return json({ ok: true, ...rest }, 201);
  } catch (err) {
    reportError("api.leads.interactions", err, { leadId: id, sourceApp: auth.ctx.actorAgentId });
    return json({ error: "Internal error" }, 500);
  }
}
