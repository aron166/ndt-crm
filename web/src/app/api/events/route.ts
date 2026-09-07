import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/app-key-auth";
import { authenticateIngest } from "@/lib/hub/ingest-auth";
import { appEventSchema } from "@/lib/hub/schema";

// Ecosystem-hub event ingestion (append-only app_events ledger).
//
// Auth: Authorization: Bearer <per-app key> — tenant + sourceApp come from the key.

export async function POST(request: Request) {
  const ctx = await authenticateIngest(request);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!rateLimit(ctx.keyId)) {
    return NextResponse.json({ error: "Rate limit exceeded (30 req/min)" }, { status: 429 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = appEventSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const body = parsed.data;

  const tenantId = ctx.tenantId;

  // Every referenced entity must belong to the key's tenant — a foreign id is
  // a caller bug (or a probe), never a cross-tenant write.
  const [agentOk, personOk, companyOk] = await Promise.all([
    body.agentId ? db.agent.findFirst({ where: { id: body.agentId }, select: { id: true } }) /* agents are portfolio-global */ : true,
    body.personId ? db.person.findFirst({ where: { id: body.personId, tenantId, deletedAt: null }, select: { id: true } }) : true,
    body.companyId ? db.company.findFirst({ where: { id: body.companyId, tenantId, deletedAt: null }, select: { id: true } }) : true,
  ]);
  if (!agentOk || !personOk || !companyOk) {
    return NextResponse.json({ error: "Unknown agentId, personId, or companyId for this tenant" }, { status: 400 });
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
    // P2003 = FK violation: the caller referenced an agent/person/company/tenant
    // that doesn't exist — their bug, not ours.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      return NextResponse.json(
        { error: "Unknown agentId, personId, or companyId reference" },
        { status: 400 },
      );
    }
    console.error("[/api/events] ingest failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
