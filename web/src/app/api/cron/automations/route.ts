import { runIdleAutomations } from "@/lib/automations/idle";
import { runLifecycleSweep } from "@/lib/leads/lifecycle-sweep";
import { db } from "@/lib/db";
import { reportError } from "@/lib/report-error";

// Scheduled evaluator for time-based automations (deal_idle_in_stage).
// Invoked by Vercel Cron (see web/vercel.json). Vercel attaches
// `Authorization: Bearer <CRON_SECRET>` when the CRON_SECRET env var is set;
// we reject anything else so the endpoint can't be triggered externally.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    // Each half in its own try: Hobby crons run once a day, so one failing must not skip the other.
    let result: Awaited<ReturnType<typeof runIdleAutomations>> | null = null;
    try { result = await runIdleAutomations(); } catch (err) { reportError("cron.automations.idle", err); }
    // W2 lead lifecycle: SLA escalation + recall wake-up (tasks and stage moves only, no sends).
    // Only tenants that have a transition table are on the W2 lifecycle.
    const tenants = await db.leadStatusTransition.findMany({ distinct: ["tenantId"], select: { tenantId: true } });
    const lifecycle = [];
    for (const t of tenants) {
      try { lifecycle.push({ tenantId: t.tenantId, ...(await runLifecycleSweep(t.tenantId)) }); }
      catch (err) { reportError("cron.automations.lifecycle", err, { tenantId: t.tenantId }); }
    }
    return Response.json({ ok: result != null, ...(result ?? {}), lifecycle });
  } catch (err) {
    reportError("cron.automations", err);
    return Response.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
