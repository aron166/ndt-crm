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
    const result = await runIdleAutomations();
    // W2 lead lifecycle: SLA escalation + recall wake-up (tasks and stage moves only, no sends).
    const tenants = await db.tenant.findMany({ select: { id: true } });
    const lifecycle = [];
    for (const t of tenants) lifecycle.push({ tenantId: t.id, ...(await runLifecycleSweep(t.id)) });
    return Response.json({ ok: true, ...result, lifecycle });
  } catch (err) {
    reportError("cron.automations", err);
    return Response.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
