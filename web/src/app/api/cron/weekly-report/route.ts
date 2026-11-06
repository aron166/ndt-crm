import { TENANT_ID } from "@/lib/tenant";
import { sendWeeklyReports } from "@/lib/reports/weekly-email";
import { reportError } from "@/lib/report-error";
import { requireCronSecret } from "@/lib/api/http";

// Monday weekly sales report for the tenant's reviewers. Fires once at 05:00 UTC Monday (see vercel.json);
// sendWeeklyReports only sends when that lands in the Monday morning window
// in Europe/Budapest.
export async function GET(request: Request) {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  try {
    const result = await sendWeeklyReports(TENANT_ID);
    return Response.json({ ok: true, ...result });
  } catch (err) {
    reportError("cron.weeklyReport", err);
    return Response.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
