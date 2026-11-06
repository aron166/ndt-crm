import { TENANT_ID } from "@/lib/tenant";
import { sendContentDigests } from "@/lib/content/digest";
import { reportError } from "@/lib/report-error";
import { requireCronSecret } from "@/lib/api/http";

// Scheduled daily digest for content reviewers (spec §5). Fired twice a day (06:00 and 07:00 UTC, see
// vercel.json) to cover both sides of the DST switch — sendContentDigests
// only actually sends on the run that lands at 08:00 Europe/Budapest.
export async function GET(request: Request) {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  try {
    const result = await sendContentDigests(TENANT_ID);
    return Response.json({ ok: true, ...result });
  } catch (err) {
    reportError("cron.contentDigest", err);
    return Response.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
