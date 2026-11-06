import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { readJson, requireAppKey } from "@/lib/api/http";
import { appEventSchema } from "@/lib/hub/schema";
import { hubRefsInTenant, isMissingRef, FOREIGN_REF_ERROR, MISSING_REF_ERROR } from "@/lib/hub/refs";
import { reportError } from "@/lib/report-error";

// Ecosystem-hub event ingestion (append-only app_events ledger).
//
// Auth: Authorization: Bearer <per-app key> — tenant + sourceApp come from the key.

export async function POST(request: Request) {
  const ctx = await requireAppKey(request);
  if (ctx instanceof NextResponse) return ctx;

  const raw = await readJson(request);
  if (raw instanceof NextResponse) return raw;

  const parsed = appEventSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const body = parsed.data;

  const tenantId = ctx.tenantId;

  if (!(await hubRefsInTenant(tenantId, body))) {
    return NextResponse.json({ error: FOREIGN_REF_ERROR }, { status: 400 });
  }

  // sourceApp is the key's appSlug — never the body's (a key for app X can't
  // attribute events to app Y).
  const sourceApp = ctx.appSlug;

  // NOTE: app_event is the hub's own append-only ledger, distinct from audit_log
  // (which tracks mutations to CRM entities). When this endpoint starts mutating
  // audited CRM entities (e.g. a BirdsView lead webhook creating a `lead`/`deal`),
  // attribute it via audit(..., { actor: "agent", actorAgentId, tenantId }).
  try {
    const event = await db.appEvent.create({
      data: {
        tenantId,
        sourceApp,
        eventType: body.eventType,
        payload: body.payload as Prisma.InputJsonValue,
        ...(body.agentId ? { agentId: body.agentId } : {}),
        ...(body.personId ? { personId: body.personId } : {}),
        ...(body.companyId ? { companyId: body.companyId } : {}),
      },
      select: { id: true, sourceApp: true, eventType: true, createdAt: true },
    });

    return NextResponse.json({ ok: true, event }, { status: 201 });
  } catch (err) {
    if (isMissingRef(err)) return NextResponse.json({ error: MISSING_REF_ERROR }, { status: 400 });
    reportError("events.ingest", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
