import { runScheduledSends } from "@/lib/campaigns/scheduled-send";
import { reportError } from "@/lib/report-error";

// Sends the next due, approved campaign drafts of campaigns whose scheduled-sending switch is on.
// Called every few minutes by an external clock with `Authorization: Bearer <CRON_SECRET>`, same
// auth as cron/automations. SCHEDULED_SENDING=on is the master switch: anything else does nothing.
async function handle(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (process.env.SCHEDULED_SENDING !== "on") return Response.json({ ok: true, disabled: true });
  try {
    return Response.json(await runScheduledSends());
  } catch (err) {
    reportError("cron.campaignSend", err);
    return Response.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
