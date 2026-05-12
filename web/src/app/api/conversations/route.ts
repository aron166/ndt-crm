import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { validateServiceKey, unauthorizedResponse } from "@/lib/service-auth";

interface MessageInput {
  role: string;
  content: string;
}

interface ConversationPayload {
  tenantId?: number;
  agentId?: number;
  personId?: number;
  companyId?: number;
  channel: string;
  summary?: string;
  endedAt?: string;
  messages?: MessageInput[];
}

export async function POST(request: Request) {
  if (!validateServiceKey(request)) return unauthorizedResponse();

  let body: ConversationPayload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { channel, summary, endedAt, messages, agentId, personId, companyId } = body;
  const tenantId = body.tenantId ?? 1;

  if (!channel) {
    return NextResponse.json({ error: "channel is required" }, { status: 400 });
  }

  const conversation = await db.conversation.create({
    data: {
      tenantId,
      channel,
      ...(summary   ? { summary }                    : {}),
      ...(endedAt   ? { endedAt: new Date(endedAt) } : {}),
      ...(agentId   ? { agentId }                    : {}),
      ...(personId  ? { personId }                   : {}),
      ...(companyId ? { companyId }                  : {}),
      ...(messages?.length
        ? { messages: { create: messages.map((m) => ({ role: m.role, content: m.content })) } }
        : {}),
    },
    select: {
      id: true,
      channel: true,
      summary: true,
      startedAt: true,
      messages: { select: { id: true, role: true, createdAt: true }, orderBy: { createdAt: "asc" } },
    },
  });

  return NextResponse.json({ ok: true, conversation }, { status: 201 });
}
