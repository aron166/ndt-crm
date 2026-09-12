import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { reportError } from "@/lib/report-error";
import { audit } from "@/lib/audit";
import { validateAppKey, rateLimit } from "@/lib/app-key-auth";
import { draftsUpsertSchema, canEdit, type DraftStatus } from "@/lib/outreach/drafts";

// Bulk draft upsert for the outreach drafting agent skill (addendum item 1).
// Can only ever create/update rows in `draft` status — approving and sending
// are human actions taken in the /outreach UI, never done here.

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

interface SkippedItem {
  companyId: number;
  campaign: string;
  step: number;
  reason: "already_sent" | "unknown_company" | "error";
}

export async function POST(request: Request) {
  const key = await validateAppKey(request);
  if (!key) return json({ error: "Unauthorized" }, 401);
  if (!rateLimit(key.keyId)) return json({ error: "Rate limit exceeded (30 req/min)" }, 429);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const body = raw as { drafts?: unknown };
  const parsed = draftsUpsertSchema.safeParse(body?.drafts);
  if (!parsed.success) {
    return json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
  }
  const items = parsed.data;

  // Verify every companyId belongs to this tenant before writing anything —
  // an unknown/foreign company is a skipped item, never a cross-tenant write.
  const companyIds = [...new Set(items.map((d) => d.companyId))];
  const ownedCompanies = await db.company.findMany({
    where: { id: { in: companyIds }, tenantId: key.tenantId },
    select: { id: true },
  });
  const ownedIds = new Set(ownedCompanies.map((c) => c.id));

  let created = 0;
  let updated = 0;
  const skipped: SkippedItem[] = [];

  for (const item of items) {
    if (!ownedIds.has(item.companyId)) {
      skipped.push({
        companyId: item.companyId,
        campaign: item.campaign,
        step: item.step,
        reason: "unknown_company",
      });
      continue;
    }

    try {
      const existing = await db.emailDraft.findUnique({
        where: {
          tenantId_companyId_campaign_step: {
            tenantId: key.tenantId,
            companyId: item.companyId,
            campaign: item.campaign,
            step: item.step,
          },
        },
      });

      if (!existing) {
        const row = await db.emailDraft.create({
          data: {
            tenantId: key.tenantId,
            companyId: item.companyId,
            personId: item.personId ?? null,
            campaign: item.campaign,
            step: item.step,
            subject: item.subject,
            body: item.body,
            toEmail: item.toEmail ?? null,
            status: "draft",
          },
        });
        audit(
          "email_draft",
          row.id,
          "create",
          null,
          { companyId: row.companyId, campaign: row.campaign, step: row.step, status: row.status },
          { tenantId: key.tenantId, actor: "agent", actorAgentId: key.appSlug },
        );
        created += 1;
        continue;
      }

      if (!canEdit(existing.status as DraftStatus)) {
        // Approved/sent/replied — a re-run of the drafting skill must never
        // clobber something a human already approved or that already went out.
        skipped.push({
          companyId: item.companyId,
          campaign: item.campaign,
          step: item.step,
          reason: "already_sent",
        });
        continue;
      }

      const row = await db.emailDraft.update({
        where: { id: existing.id },
        data: {
          personId: item.personId ?? null,
          subject: item.subject,
          body: item.body,
          toEmail: item.toEmail ?? null,
        },
      });
      audit(
        "email_draft",
        row.id,
        "update",
        { subject: existing.subject, body: existing.body, toEmail: existing.toEmail },
        { subject: row.subject, body: row.body, toEmail: row.toEmail },
        { tenantId: key.tenantId, actor: "agent", actorAgentId: key.appSlug },
      );
      updated += 1;
    } catch (err) {
      reportError("api.outreach.drafts", err, {
        tenantId: key.tenantId,
        companyId: item.companyId,
        campaign: item.campaign,
        step: item.step,
      });
      skipped.push({
        companyId: item.companyId,
        campaign: item.campaign,
        step: item.step,
        reason: "error",
      });
    }
  }

  return json({ ok: true, created, updated, skipped }, 200);
}
