import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { reportError } from "@/lib/report-error";
import { validateAppKey, rateLimit } from "@/lib/app-key-auth";
import { leadIntakeSchema } from "@/lib/leads/schema";
import { ingestLead, appThreadKey, type IngestResult } from "@/lib/leads/ingest";
import { startLeadLifecycle } from "@/lib/leads/lifecycle-sweep";
import { sendFormAlert } from "@/lib/leads/form-alert";
import { sendAutoReply, sendLeadPing } from "@/lib/leads/intake-notify";
import { sendIntroMaterial, type IntroResult } from "@/lib/leads/intro";
import { runAutomations } from "@/lib/automations/engine";
import { serializeDates } from "@/lib/serialize";
import { leadListQuerySchema, leadSearchWhere, LEAD_API_SELECT } from "@/lib/leads/api";

// Public lead-intake endpoint (Platform Foundation #4).
//
// Auth: Authorization: Bearer <per-app key> (app_api_keys, hashed). The shared
// Supabase service-role key is NOT accepted here. The key is the gate, so CORS
// is open to POST from any origin — landing pages post cross-origin.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Idempotency-Key",
  "Access-Control-Max-Age": "86400",
};

/** A repeat younger than this is probably racing the first request's own effects. */
const RECOVER_AFTER_MS = 60_000;

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
  const { status, outcome, assigned_to, q: search, campaign, page, page_size } = q.data;

  const where = {
    tenantId: key.tenantId,
    ...(status ? { status } : {}),
    ...(outcome ? { outcome } : {}),
    ...(assigned_to ? { assignedToId: assigned_to } : {}),
    ...(campaign ? { campaign } : {}),
    ...(search ? leadSearchWhere(search) : {}),
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

  // Idempotency-Key header or idempotency_key body field; two different values are a client bug.
  const header = request.headers.get("idempotency-key")?.trim().toLowerCase();
  const field = raw && typeof raw === "object" ? (raw as Record<string, unknown>).idempotency_key : undefined;
  if (header && typeof field === "string" && field.trim() && field.trim().toLowerCase() !== header) {
    return json({ error: "Idempotency-Key header and idempotency_key differ" }, 400);
  }
  if (header && raw && typeof raw === "object") raw = { ...(raw as object), idempotency_key: header };

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

    // Everything that happens AFTER the lead is committed. With an idempotency key a stamp
    // (customFields.effects_done_at) records that it all ran, so a retry after a crash in here can
    // run it once more instead of being told "deduped" and leaving sales unaware of a real lead.
    const runEffects = async (result: IngestResult) => {
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

      // W2 SLA timer: owner, first-call next action + task. Post-commit, fail-safe.
      await startLeadLifecycle(key.tenantId, result.leadId);
      // Web form: internal alert to sales (Péter + Áron). Never to the lead; no-op without Resend.
      if (parsed.data.channel === "landing") {
        // Sales ping (Telegram) and the lead's auto-reply (off until Áron signs it); both no-op when unconfigured.
        await Promise.all([
          sendFormAlert(key.tenantId, result.leadId),
          sendLeadPing(key.tenantId, result.leadId),
          sendAutoReply(key.tenantId, result.leadId),
        ]);
      }

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
      if (parsed.data.idempotency_key) {
        await db.$executeRaw`
          UPDATE "leads" SET "custom_fields" = jsonb_set(COALESCE("custom_fields", '{}'::jsonb), ARRAY['effects_done_at'], to_jsonb(${new Date().toISOString()}::text), true)
           WHERE "id" = ${result.leadId} AND "tenant_id" = ${key.tenantId}`;
      }
      return intro;
    };

    // A lead we have already recorded. Nothing was written, so by default nothing downstream fires:
    // a second intro e-mail or `lead_created` run would be a duplicate. 200, not 201.
    if (result.deduped) {
      // Idempotency repeat on a lead whose effects never completed, and old enough that the first
      // request is surely not still running them: finish the job once. (Two retries racing here
      // could both run it; shortcut, a lock would need a column.)
      const recover = result.viaIdempotencyKey && !result.effectsDone
        && result.leadCreatedAt != null && Date.now() - result.leadCreatedAt.getTime() > RECOVER_AFTER_MS;
      if (recover) await runEffects(result);
      return json(
        { ok: true, leadId: result.leadId, deduped: true, companyId: result.companyId, ...(recover ? { effectsRecovered: true } : {}) },
        200,
      );
    }

    const intro = await runEffects(result);

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
    const target = (err as { meta?: { target?: unknown } })?.meta?.target;
    const hitThreadKeyIndex =
      Array.isArray(target) ? target.includes("thread_key") : String(target ?? "").includes("thread_key");
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002" &&
      hitThreadKeyIndex &&
      (parsed.data.thread_key || parsed.data.idempotency_key)
    ) {
      // The recovery read is itself wrapped: we only got here because a
      // transaction failed, so the connection may be gone. An throw escaping
      // here would skip reportError AND return Next's bare 500 without
      // CORS_HEADERS, which a browser caller sees as an opaque CORS error
      // rather than a server error. (Vanda, #89.)
      try {
        const winner = await db.lead.findFirst({
          where: {
            tenantId: key.tenantId,
            threadKey: { in: [
              ...(parsed.data.thread_key ? [parsed.data.thread_key.trim().toLowerCase(), appThreadKey(key.appSlug, parsed.data.thread_key)] : []),
              ...(parsed.data.idempotency_key ? [appThreadKey(key.appSlug, `idem~${parsed.data.idempotency_key}`)] : []),
            ] },
          },
          select: { id: true, companyId: true },
        });
        if (winner) {
          return json(
            { ok: true, leadId: winner.id, deduped: true, companyId: winner.companyId },
            200,
          );
        }
      } catch (recoveryErr) {
        reportError("api.leads.p2002_recovery", recoveryErr, { sourceApp: key.appSlug });
      }
    }
    reportError("api.leads", err, { sourceApp: key.appSlug });
    return json({ error: "Internal error" }, 500);
  }
}
