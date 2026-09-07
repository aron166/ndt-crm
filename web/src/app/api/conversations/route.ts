import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/app-key-auth";
import { authenticateIngest } from "@/lib/hub/ingest-auth";
import { conversationIntakeSchema } from "@/lib/hub/schema";

// Agent-conversation ingestion (conversations + messages).
//
// Auth: Authorization: Bearer <per-app key> — tenant comes from the key.

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

  const parsed = conversationIntakeSchema.safeParse(raw);
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

  try {
    const conversation = await db.conversation.create({
      data: {
        tenantId,
        channel: body.channel,
        ...(body.summary ? { summary: body.summary } : {}),
        ...(body.endedAt ? { endedAt: body.endedAt } : {}),
        ...(body.agentId ? { agentId: body.agentId } : {}),
        ...(body.personId ? { personId: body.personId } : {}),
        ...(body.companyId ? { companyId: body.companyId } : {}),
        ...(body.messages?.length
          ? {
              messages: {
                create: body.messages.map((m) => ({ role: m.role, content: m.content })),
              },
            }
          : {}),
      },
      select: {
        id: true,
        channel: true,
        summary: true,
        startedAt: true,
        messages: {
          select: { id: true, role: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    return NextResponse.json({ ok: true, conversation }, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      return NextResponse.json(
        { error: "Unknown agentId, personId, or companyId reference" },
        { status: 400 },
      );
    }
    console.error("[/api/conversations] ingest failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
