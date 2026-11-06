import { runIdleAutomations } from "@/lib/automations/idle";
import { reportError } from "@/lib/report-error";
import { requireCronSecret } from "@/lib/api/http";

// Scheduled evaluator for time-based automations (deal_idle_in_stage).
// Invoked by Vercel Cron (see web/vercel.json).
export async function GET(request: Request) {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  try {
    const result = await runIdleAutomations();
    return Response.json({ ok: true, ...result });
  } catch (err) {
    reportError("cron.automations", err);
    return Response.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
