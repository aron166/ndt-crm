import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { reportError } from "@/lib/report-error";
import { validateAppKey, rateLimit } from "@/lib/app-key-auth";
import { leadIntakeSchema } from "@/lib/leads/schema";
import { ingestLead } from "@/lib/leads/ingest";
import { runAutomations } from "@/lib/automations/engine";

// Public lead-intake endpoint (Platform Foundation #4).
//
// Auth: Authorization: Bearer <per-app key> (app_api_keys, hashed). The shared
// Supabase service-role key is NOT accepted here. The key is the gate, so CORS
// is open to POST from any origin — landing pages post cross-origin.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: Request) {
  const key = await validateAppKey(request);
  if (!key) return json({ error: "Unauthorized" }, 401);

  if (!rateLimit(key.keyId)) {
    return json({ error: "Rate limit exceeded (30 req/min)" }, 429);
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const parsed = leadIntakeSchema.safeParse(raw);
  if (!parsed.success) {
    return json(
      { error: "Validation failed", details: parsed.error.flatten() },
      400,
    );
  }

  try {
    const result = await db.$transaction((tx) =>
      ingestLead(parsed.data, { tenantId: key.tenantId, appSlug: key.appSlug }, tx),
    );

    // Fire task-automation rules for the new lead (e.g. the seeded follow-up
    // task). Runs post-commit and is itself fail-safe, so it never blocks or
    // fails the intake response.
    await runAutomations({
      type: "lead_created",
      tenantId: key.tenantId,
      leadId: result.leadId,
      companyId: result.companyId,
      personId: result.personId,
      companyName: parsed.data.company_name,
      fields: {
        company: parsed.data.company_name,
        source: parsed.data.source ?? null,
        channel: parsed.data.channel,
        campaign: parsed.data.campaign ?? null,
        serviceInterest: parsed.data.service_interest ?? null,
        message: parsed.data.message ?? null,
        sourceApp: key.appSlug,
      },
    });

    return json(
      {
        ok: true,
        leadId: result.leadId,
        companyId: result.companyId,
        personId: result.personId,
      },
      201,
    );
  } catch (err) {
    reportError("api.leads", err, { sourceApp: key.appSlug });
    return json({ error: "Internal error" }, 500);
  }
}
