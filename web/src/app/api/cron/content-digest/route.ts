import { sendContentDigests } from "@/lib/content/digest";
import { reportError } from "@/lib/report-error";

// Scheduled daily digest for content reviewers (spec §5). Same auth as
// /api/cron/automations. Fired twice a day (06:00 and 07:00 UTC, see
// vercel.json) to cover both sides of the DST switch — sendContentDigests
// only actually sends on the run that lands at 08:00 Europe/Budapest.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const result = await sendContentDigests(1);
    return Response.json({ ok: true, ...result });
  } catch (err) {
    reportError("cron.contentDigest", err);
    return Response.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
