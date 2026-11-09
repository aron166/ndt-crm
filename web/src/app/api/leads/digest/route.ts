import { json, leadApiCtx } from "@/lib/leads/api";
import { getDailyDigest } from "@/lib/leads/lifecycle-sweep";
import { reportError } from "@/lib/report-error";
import { serializeDates } from "@/lib/serialize";

/**
 * GET /api/leads/digest: the W2 08:00 sweep content for the key's tenant (due
 * today, overdue, past max age, no next action) + a ready text. App-key auth,
 * read-only. The Telegram send lives in a separate lane; this only returns data.
 */
export async function GET(request: Request) {
  const auth = await leadApiCtx(request);
  if ("res" in auth) return auth.res;
  try {
    const digest = await getDailyDigest(auth.ctx.tenantId);
    return json({ ok: true, digest: serializeDates(digest) });
  } catch (err) {
    reportError("api.leads.digest", err, { sourceApp: auth.ctx.actorAgentId });
    return json({ error: "Internal error" }, 500);
  }
}
