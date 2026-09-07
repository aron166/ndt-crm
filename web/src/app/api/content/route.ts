import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { validateAppKey, rateLimit } from "@/lib/app-key-auth";
import { contentIntakeSchema, resolveCampaignSlug } from "@/lib/marketing/schema";

// Content-draft intake endpoint (Marketing module). Same per-app-key auth as
// POST /api/leads — the content factory posts drafts here; the shared
// service-role key is NOT accepted. The key is the gate, so CORS is open.

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

  try {
    const contentItemId = await db.$transaction(async (tx) => {
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

      // 2. Create the content item. Factory drafts skip `draft` → land in_review.
      const item = await tx.contentItem.create({
        data: {
          tenantId,
          campaignId,
          channel: input.channel,
          contentType: input.content_type,
          title: input.title,
          body: input.body,
          status: "in_review",
          internal: input.internal,
          source: sourceApp,
          scheduledFor: input.scheduled_for ? new Date(input.scheduled_for) : null,
          ...(input.source_meta
            ? { sourceMeta: input.source_meta as Prisma.InputJsonValue }
            : {}),
        },
        select: { id: true },
      });

      // 3. Assets (URL/path only — no upload in this phase).
      if (input.assets?.length) {
        await tx.contentAsset.createMany({
          data: input.assets.map((a, i) => ({
            tenantId,
            contentItemId: item.id,
            kind: a.kind,
            url: a.url,
            caption: a.caption ?? null,
            position: i,
          })),
        });
      }

      // 4. Audit (append-only, attributed to the source app).
      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId: null,
          action: "create",
          entityType: "content_item",
          entityId: item.id,
          changes: {
            before: null,
            after: {
              campaignId,
              channel: input.channel,
              contentType: input.content_type,
              status: "in_review",
              internal: input.internal,
              source: sourceApp,
            },
          } as Prisma.InputJsonValue,
        },
      });

      // 5. Emit an app_events row so the ecosystem hub sees the submission.
      await tx.appEvent.create({
        data: {
          tenantId,
          sourceApp,
          eventType: "content.submitted",
          payload: input as unknown as Prisma.InputJsonValue,
        },
      });

      return item.id;
    });

    return json({ ok: true, contentItemId }, 201);
  } catch (err) {
    console.error("[/api/content] ingest failed:", err);
    return json({ error: "Internal error" }, 500);
  }
}
