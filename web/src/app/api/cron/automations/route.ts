import { runIdleAutomations } from "@/lib/automations/idle";

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
    return Response.json({ ok: true, ...result });
  } catch (err) {
    console.error("[/api/cron/automations] failed:", err);
    return Response.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
