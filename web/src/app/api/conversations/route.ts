import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { readJson, requireAppKey } from "@/lib/api/http";
import { conversationIntakeSchema } from "@/lib/hub/schema";
import { hubRefsInTenant, isMissingRef, FOREIGN_REF_ERROR, MISSING_REF_ERROR } from "@/lib/hub/refs";
import { reportError } from "@/lib/report-error";

// Agent-conversation ingestion (conversations + messages).
//
// Auth: Authorization: Bearer <per-app key> — tenant comes from the key.

export async function POST(request: Request) {
  const ctx = await requireAppKey(request);
  if (ctx instanceof NextResponse) return ctx;

  const raw = await readJson(request);
  if (raw instanceof NextResponse) return raw;

  const parsed = conversationIntakeSchema.safeParse(raw);
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
    if (isMissingRef(err)) return NextResponse.json({ error: MISSING_REF_ERROR }, { status: 400 });
    reportError("conversations.ingest", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
