import { sendWeeklyReports } from "@/lib/reports/weekly-email";
import { reportError } from "@/lib/report-error";

const TENANT_ID = 1;

// Monday weekly sales report for the tenant's reviewers. Same auth as
// /api/cron/automations. Fires once at 05:00 UTC Monday (see vercel.json);
// sendWeeklyReports only sends when that lands in the Monday morning window
// in Europe/Budapest.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const result = await sendWeeklyReports(TENANT_ID);
    return Response.json({ ok: true, ...result });
  } catch (err) {
    reportError("cron.weeklyReport", err);
    return Response.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
