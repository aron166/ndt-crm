import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { validateAppKey, rateLimit } from "@/lib/app-key-auth";
import { reportError } from "@/lib/report-error";
import { getQualificationQuestions } from "@/lib/leads/queries";

// GET /api/calls/pending — transcripts the auto-outcome skill has not yet
// parsed. Read-only queue, mirrors /api/content/queue. App-key auth, same
// shape as the rest of the calls API.

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

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 50;

export async function GET(request: Request) {
  const key = await validateAppKey(request);
  if (!key) return json({ error: "Unauthorized" }, 401);
  if (!rateLimit(key.keyId)) return json({ error: "Rate limit exceeded (30 req/min)" }, 429);

  const raw = new URL(request.url).searchParams.get("limit");
  let limit = DEFAULT_LIMIT;
  if (raw) {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1 || n > MAX_LIMIT) {
      return json({ error: "Invalid limit", details: { allowed: `1..${MAX_LIMIT}` } }, 400);
    }
    limit = n;
  }

  try {
    const rows = await db.interaction.findMany({
      where: {
        tenantId: key.tenantId,
        type: "call",
        outcome: "transcribed",
        leadId: { not: null },
        supersededBy: { none: {} },
        transcript: { not: null },
      },
      orderBy: { occurredAt: "desc" },
      take: limit,
      select: {
        id: true,
        leadId: true,
        companyId: true,
        occurredAt: true,
        transcript: true,
        campaign: true,
        company: { select: { name: true } },
        person: { select: { firstName: true, lastName: true } },
        lead: { select: { status: true } },
      },
    });

    const items = rows.map((r) => ({
      id: r.id,
      lead_id: r.leadId,
      company_id: r.companyId,
      company_name: r.company?.name ?? null,
      person_name: r.person ? `${r.person.lastName ?? ""} ${r.person.firstName ?? ""}`.trim() || null : null,
      occurred_at: r.occurredAt,
      transcript: r.transcript,
      lead_status: r.lead?.status ?? null,
      campaign: r.campaign,
    }));

    // The tenant's CURRENT qualification slugs ride along: the skill may only
    // call this route and /result, so without them it would emit answer slugs
    // from a hard-coded default list that a tenant can rename at /leads/setup —
    // and a wrong slug moves the lead's A-E tier.
    const questions = (await getQualificationQuestions(key.tenantId)).map((q) => ({
      slug: q.slug,
      label: q.label,
    }));

    return json({ ok: true, items, questions }, 200);
  } catch (err) {
    reportError("api.calls.pending", err, { tenantId: key.tenantId });
    return json({ error: "Internal error" }, 500);
  }
}
