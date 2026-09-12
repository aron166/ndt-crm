import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { reportError } from "@/lib/report-error";
import { validateAppKey, rateLimit } from "@/lib/app-key-auth";
import { leadIntakeSchema } from "@/lib/leads/schema";
import { ingestLead } from "@/lib/leads/ingest";
import { sendIntroMaterial, type IntroResult } from "@/lib/leads/intro";
import { runAutomations } from "@/lib/automations/engine";
import { serializeDates } from "@/lib/serialize";
import { leadListQuerySchema, LEAD_API_SELECT } from "@/lib/leads/api";

// Public lead-intake endpoint (Platform Foundation #4).
//
// Auth: Authorization: Bearer <per-app key> (app_api_keys, hashed). The shared
// Supabase service-role key is NOT accepted here. The key is the gate, so CORS
// is open to POST from any origin — landing pages post cross-origin.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/** GET /api/leads?status=&outcome=&assigned_to=&page=&page_size= — paginated, newest first. */
export async function GET(request: Request) {
  const key = await validateAppKey(request);
  if (!key) return json({ error: "Unauthorized" }, 401);
  if (!rateLimit(key.keyId)) return json({ error: "Rate limit exceeded (30 req/min)" }, 429);

  const q = leadListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!q.success) return json({ error: "Validation failed", details: q.error.flatten() }, 400);
  const { status, outcome, assigned_to, page, page_size } = q.data;

  const where = {
    tenantId: key.tenantId,
    ...(status ? { status } : {}),
    ...(outcome ? { outcome } : {}),
    ...(assigned_to ? { assignedToId: assigned_to } : {}),
  };
  const [items, total] = await Promise.all([
    db.lead.findMany({ where, select: LEAD_API_SELECT, orderBy: { createdAt: "desc" }, skip: (page - 1) * page_size, take: page_size }),
    db.lead.count({ where }),
  ]);
  return json({ ok: true, items: serializeDates(items), page, page_size, total, total_pages: Math.ceil(total / page_size) }, 200);
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

    // A reply we have already recorded. Nothing was written, so nothing
    // downstream may fire either: re-sending the intro material or re-running
    // `lead_created` would mean a second email and a second follow-up task for
    // one answered thread. 200, not 201 — nothing was created.
    if (result.deduped) {
      return json(
        { ok: true, leadId: result.leadId, deduped: true, companyId: result.companyId },
        200,
      );
    }

    // The intro material (termékismertető) is the thing the qualification
    // answers were traded for — send it (or task it) before anything else.
    const intro: IntroResult | null = parsed.data.send_intro
      ? await sendIntroMaterial({
          tenantId: key.tenantId,
          leadId: result.leadId,
          to: parsed.data.contact_email,
          companyId: result.companyId,
          personId: result.personId,
        })
      : null;

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
        // Derived qualification tier (A–E) — lets a rule target e.g. tier D.
        tier: result.tier,
      },
    });

    return json(
      {
        ok: true,
        leadId: result.leadId,
        tier: result.tier,
        ...(intro ? { intro } : {}),
        companyId: result.companyId,
        personId: result.personId,
        ...(result.draftId ? { draftId: result.draftId } : {}),
      },
      201,
    );
  } catch (err) {
    // Two posts for one thread raced past the in-transaction check and the
    // unique index caught the loser. That is the index doing its job, not a
    // failure: re-read the winner and answer as if we had deduped, so the
    // reply-intake skill sees the same idempotent result either way.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002" &&
      parsed.data.thread_key
    ) {
      const winner = await db.lead.findFirst({
        where: { tenantId: key.tenantId, threadKey: parsed.data.thread_key.trim() },
        select: { id: true, companyId: true },
      });
      if (winner) {
        return json(
          { ok: true, leadId: winner.id, deduped: true, companyId: winner.companyId },
          200,
        );
      }
    }
    reportError("api.leads", err, { sourceApp: key.appSlug });
    return json({ error: "Internal error" }, 500);
  }
}
