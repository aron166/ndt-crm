import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { reportError } from "@/lib/report-error";
import { audit } from "@/lib/audit";
import { validateAppKey, rateLimit } from "@/lib/app-key-auth";
import { draftsUpsertSchema, canEdit, type DraftStatus } from "@/lib/outreach/drafts";
import { validTemplateVersion } from "@/lib/outreach/template";

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

  // `personId` arrives from the agent payload and is NOT proven to belong here
  // just because the company does. Without this check an app key could address
  // a draft at any person row in the database — and sendDraft would resolve
  // their email. Only a person with a Contact at that company survives.
  // (Vanda, #88.)
  const wantedPersonIds = [...new Set(items.map((d) => d.personId).filter((p): p is number => typeof p === "number"))];
  const validContacts = wantedPersonIds.length
    ? await db.contact.findMany({
        where: { tenantId: key.tenantId, personId: { in: wantedPersonIds }, companyId: { in: [...ownedIds] } },
        select: { personId: true, companyId: true },
      })
    : [];
  const validPairs = new Set(validContacts.map((c) => `${c.personId}:${c.companyId}`));
  // senderUserId must be a user of THIS tenant; anything else is dropped to null.
  const wantedSenders = [...new Set(items.map((d) => d.senderUserId).filter((u): u is number => typeof u === "number"))];
  const validSenders = new Set(
    wantedSenders.length
      ? (await db.user.findMany({ where: { tenantId: key.tenantId, id: { in: wantedSenders } }, select: { id: true } })).map((u) => u.id)
      : [],
  );
  // §6b: a claimed template version must really be a version of the item that
  // fills that campaign+step slot. Anything else is dropped to null rather than
  // trusted, the same way senderUserId and personId are.
  const claimedTemplates = [...new Set(
    items.map((d) => d.templateVersionId).filter((v): v is number => typeof v === "number"),
  )];
  const allowedTemplates = new Map<number, { campaign: string | null; step: number | null }>();
  if (claimedTemplates.length) {
    const versions = await db.contentVersion.findMany({
      where: { id: { in: claimedTemplates }, tenantId: key.tenantId },
      select: { id: true, item: { select: { outreachCampaign: true, outreachStep: true } } },
    });
    for (const v of versions) {
      allowedTemplates.set(v.id, { campaign: v.item.outreachCampaign, step: v.item.outreachStep });
    }
  }
  const templateFor = (item: { templateVersionId?: number | null; campaign: string; step: number }) =>
    validTemplateVersion(item.templateVersionId, allowedTemplates, item.campaign, item.step);

  const trackingFor = (item: { senderUserId?: number | null; wave?: number | null; dueAt?: Date | null }) => ({
    ...(item.senderUserId !== undefined ? { senderUserId: item.senderUserId != null && validSenders.has(item.senderUserId) ? item.senderUserId : null } : {}),
    ...(item.wave !== undefined ? { wave: item.wave } : {}),
    ...(item.dueAt !== undefined ? { dueAt: item.dueAt } : {}),
  });

  const personFor = (item: { personId?: number | null; companyId: number }) =>
    item.personId != null && validPairs.has(`${item.personId}:${item.companyId}`) ? item.personId : null;

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
            personId: personFor(item),
            campaign: item.campaign,
            step: item.step,
            subject: item.subject,
            body: item.body,
            toEmail: item.toEmail ?? null,
            status: "draft",
            templateVersionId: templateFor(item),
            ...trackingFor(item),
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
          personId: personFor(item),
          subject: item.subject,
          body: item.body,
          toEmail: item.toEmail ?? null,
          // Absent means "not stated", not "clear it": a re-run of the drafting
          // skill without the field must not wipe the provenance of a draft
          // that WAS built from a template (Vanda, #105).
          ...(item.templateVersionId !== undefined ? { templateVersionId: templateFor(item) } : {}),
          ...trackingFor(item),
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
