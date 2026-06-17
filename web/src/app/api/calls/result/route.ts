import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { validateAppKey, rateLimit } from "@/lib/app-key-auth";
import { callResultSchema, composeCallNotes } from "@/lib/calls/result";
import { analyzeCallTranscript } from "@/lib/calls/analyze";

// Call-result intake. The external transcription/analysis pipeline (Make:
// recorder → Drive → Whisper → AI) posts the finished transcript + analysis
// here; we APPEND it to the company's interaction timeline (append-only). Same
// per-app-key auth as /api/leads — the shared service-role key is NOT accepted.

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

  const parsed = callResultSchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
  }
  const input = parsed.data;
  const tenantId = key.tenantId;

  // The company must exist in THIS tenant (never trust a body-supplied tenant).
  const company = await db.company.findFirst({
    where: { id: input.company_id, tenantId, deletedAt: null },
    select: { id: true },
  });
  if (!company) return json({ error: "Company not found" }, 404);

  // If a person is named, it must belong to the same tenant & still be active.
  if (input.person_id) {
    const person = await db.person.findFirst({
      where: { id: input.person_id, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!person) return json({ error: "Person not found" }, 404);
  }

  const occurredAt = input.occurred_at ? new Date(input.occurred_at) : new Date();
  // If the pipeline didn't pre-analyze, do it here (Groq, free, best-effort).
  const analysis =
    input.analysis ?? (input.transcript ? (await analyzeCallTranscript(input.transcript)) ?? undefined : undefined);
  const notes = composeCallNotes({
    analysis,
    transcript: input.transcript,
    durationSec: input.duration_sec,
    callId: input.call_id,
  });

  try {
    const interaction = await db.interaction.create({
      data: {
        tenantId,
        companyId: company.id,
        personId: input.person_id ?? null,
        type: "call",
        direction: "outbound",
        outcome: "transcribed",
        notes,
        occurredAt,
      },
      select: { id: true },
    });

    await db.auditLog.create({
      data: {
        tenantId,
        actorUserId: null,
        action: "create",
        entityType: "interaction",
        entityId: interaction.id,
        changes: {
          before: null,
          after: { type: "call", outcome: "transcribed", source: key.appSlug, callId: input.call_id ?? null },
        } as Prisma.InputJsonValue,
      },
    });

    revalidatePath(`/companies/${company.id}`);
    if (input.person_id) revalidatePath(`/persons/${input.person_id}`);
    revalidatePath("/calls");

    return json({ ok: true, interactionId: interaction.id }, 201);
  } catch {
    return json({ error: "Failed to record call result" }, 500);
  }
}
