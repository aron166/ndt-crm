import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { validateServiceKey, unauthorizedResponse } from "@/lib/service-auth";

interface EventPayload {
  tenantId?: number;
  sourceApp: string;
  eventType: string;
  payload: Record<string, unknown>;
  agentId?: number;
  personId?: number;
  companyId?: number;
}

export async function POST(request: Request) {
  if (!validateServiceKey(request)) return unauthorizedResponse();

  let body: EventPayload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { sourceApp, eventType, payload, agentId, personId, companyId } = body;
  const tenantId = body.tenantId ?? 1;

  if (!sourceApp || !eventType || !payload) {
    return NextResponse.json(
      { error: "sourceApp, eventType, and payload are required" },
      { status: 400 }
    );
  }

  const event = await db.appEvent.create({
    data: {
      tenantId,
      sourceApp,
      eventType,
      payload: payload as Prisma.InputJsonValue,
      ...(agentId   ? { agentId }   : {}),
      ...(personId  ? { personId }  : {}),
      ...(companyId ? { companyId } : {}),
    },
    select: { id: true, sourceApp: true, eventType: true, createdAt: true },
  });

  return NextResponse.json({ ok: true, event }, { status: 201 });
}
