import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { reportError } from "@/lib/report-error";
import { validateAppKey, rateLimit } from "@/lib/app-key-auth";
import { contentIntakeSchema, resolveCampaignSlug, defaultCategory } from "@/lib/marketing/schema";
import { createItem, addChecks } from "@/lib/content/service";
import { extractWarnings } from "@/lib/content/warnings";

// Content-draft intake endpoint (Marketing module). Same per-app-key auth as
// POST /api/leads — the content factory posts drafts here; the shared
// service-role key is NOT accepted. The key is the gate, so CORS is open.
//
// Item + version 1 are created through lib/content/service.ts (the one write
// path for the approval pipeline) — this route only resolves the campaign,
// then attaches assets to the new version.

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

  const parsed = contentIntakeSchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
  }
  const input = parsed.data;
  const tenantId = key.tenantId;
  const sourceApp = key.appSlug.trim();
  const actor = { tenantId, kind: "app" as const, appSlug: sourceApp };

  try {
    const result = await db.$transaction(async (tx) => {
      // 1. Resolve / auto-create the campaign (by slug, tenant-scoped).
      let campaignId: number | null = null;
      const slug = resolveCampaignSlug(input);
      if (slug) {
        const existing = await tx.campaign.findFirst({
          where: { tenantId, slug },
          select: { id: true },
        });
        if (existing) {
          campaignId = existing.id;
        } else {
          const created = await tx.campaign.create({
            data: {
              tenantId,
              slug,
              name: input.campaign_name ?? input.campaign_slug ?? slug,
              project: input.project ?? null,
            },
            select: { id: true },
          });
          campaignId = created.id;
          await tx.auditLog.create({
            data: {
              tenantId,
              actorUserId: null,
              action: "create",
              entityType: "campaign",
              entityId: created.id,
              changes: { before: null, after: { slug, source: sourceApp } } as Prisma.InputJsonValue,
            },
          });
        }
      }

      // 2. Create the item (+ version 1) through the one write path.
      const created = await createItem(
        actor,
        {
          title: input.title,
          body: input.body,
          category: input.category ?? defaultCategory(input.content_type),
          channel: input.channel,
          contentType: input.content_type,
          format: input.format ?? null,
          purpose: input.purpose ?? null,
          campaignId,
          externalRef: input.external_ref ?? null,
          changeNote: input.change_note ?? null,
          internal: input.internal,
          source: sourceApp,
          ...(input.source_meta ? { sourceMeta: input.source_meta as Prisma.InputJsonValue } : {}),
          scheduledFor: input.scheduled_for ? new Date(input.scheduled_for) : null,
          importing: input.import,
        },
        tx,
      );
      if (!created.ok) return created;
      if (created.existed) {
        return { ok: true as const, contentItemId: created.itemId, versionId: created.versionId, existed: true };
      }

      // 3. Assets (URL/path only — no upload in this phase), attached to v1.
      if (input.assets?.length) {
        await tx.contentAsset.createMany({
          data: input.assets.map((a, i) => ({
            tenantId,
            contentItemId: created.itemId,
            versionId: created.versionId,
            kind: a.kind,
            url: a.url,
            caption: a.caption ?? null,
            position: i,
          })),
        });
      }

      // 4. Emit an app_events row so the ecosystem hub sees the submission.
      await tx.appEvent.create({
        data: {
          tenantId,
          sourceApp,
          eventType: "content.submitted",
          payload: input as unknown as Prisma.InputJsonValue,
        },
      });

      return { ok: true as const, contentItemId: created.itemId, versionId: created.versionId, existed: false };
    });

    if (!result.ok) return json({ error: result.error }, result.status);
    if (result.existed) {
      return json({ ok: true, contentItemId: result.contentItemId, versionId: result.versionId, existed: true }, 200);
    }

    // Extract ⚠ checks AFTER commit — addChecks uses the global db client, not
    // this tx, and a checklist failure must never lose the item itself.
    let checksCreated = 0;
    const shouldExtract = input.extract_warnings ?? input.import;
    if (shouldExtract) {
      const warnings = extractWarnings(input.body);
      if (warnings.length) {
        try {
          const res = await addChecks(actor, result.contentItemId, warnings.map((w) => ({ ...w, source: "import" as const })));
          if (res.ok) checksCreated = res.created;
        } catch (err) {
          reportError("api.content.addChecks", err, { tenantId, itemId: result.contentItemId });
        }
      }
    }

    return json(
      {
        ok: true,
        contentItemId: result.contentItemId,
        versionId: result.versionId,
        status: "in_review",
        checksCreated,
      },
      201,
    );
  } catch (err) {
    reportError("api.content.create", err, { tenantId });
    return json({ error: "Internal error" }, 500);
  }
}
