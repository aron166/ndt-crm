import { NextResponse } from "next/server";
import { validateAppKey, rateLimit } from "@/lib/app-key-auth";
import { reportError } from "@/lib/report-error";
import { getWeeklyReport, parseWindow, REPORT_QUERY_COUNT } from "@/lib/reports/weekly";

// GET /api/reports/weekly?from=&to= - the weekly sales-engine report as JSON.
// Pure read, tenant from the app key. Definitions: lib/reports/weekly.ts.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request: Request) {
  const key = await validateAppKey(request);
  if (!key) return json({ error: "Unauthorized" }, 401);
  if (!rateLimit(key.keyId)) return json({ error: "Rate limit exceeded (30 req/min)" }, 429);

  const sp = new URL(request.url).searchParams;
  const window = parseWindow(sp.get("from"), sp.get("to"));
  if ("error" in window) {
    return json({ error: "Invalid window", details: { reason: window.error } }, 400);
  }

  try {
    const r = await getWeeklyReport(key.tenantId, window);
    return json(
      {
        ok: true,
        from: r.from,
        to: r.to,
        query_count: REPORT_QUERY_COUNT,
        leads_created: {
          total: r.leadsTotal,
          by_source_tier: r.leadsBySourceTier.map((x) => ({ source: x.source, tier: x.tier, count: x.count })),
        },
        tier_a: {
          total: r.tierA.total,
          without_task: r.tierA.withoutTask,
          awaiting_call: r.tierA.awaitingCall,
          contacted: r.tierA.contacted,
          median_minutes: r.tierA.medianMinutes,
          p90_minutes: r.tierA.p90Minutes,
          leads: r.tierA.leads.map((l) => ({
            lead_id: l.leadId,
            company_name: l.companyName,
            created_at: l.createdAt,
            task_at: l.taskAt,
            first_call_at: l.firstCallAt,
            minutes_to_contact: l.minutesToContact,
          })),
        },
        call_outcomes: {
          total: r.callsTotal,
          by_outcome: r.callOutcomes.map((x) => ({ outcome: x.outcome, count: x.count })),
        },
        demos: { booked: r.demos.booked, scheduled: r.demos.scheduled, held: r.demos.held },
        stage_transitions: r.stageTransitions.map((x) => ({ from: x.from, to: x.to, count: x.count })),
        suppression: { added: r.suppression.added, drafts_cancelled: r.suppression.draftsCancelled },
        top_companies: r.topCompanies.map((c) => ({
          company_id: c.companyId,
          name: c.name,
          touches: c.touches,
          last_touch_at: c.lastTouchAt,
        })),
      },
      200,
    );
  } catch (err) {
    reportError("api.reports.weekly", err, { tenantId: key.tenantId });
    return json({ error: "Internal error" }, 500);
  }
}
