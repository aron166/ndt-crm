import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { validateAppKey, rateLimit } from "@/lib/app-key-auth";
import { callResultSchema, composeCallNotes, type CallResultInput } from "@/lib/calls/result";
import { analyzeCallTranscript } from "@/lib/calls/analyze";
import {
  decideAutoOutcome, toCallOutcome, AUTO_OUTCOME_LABELS, AUTO_OUTCOME_REASON_LABEL, type ParsedCall,
} from "@/lib/calls/auto-outcome";
import { logLeadCallOutcome, setLeadQualification, type LeadCtx } from "@/lib/leads/service";
import { callOutcomeLabel } from "@/lib/leads/outcomes";
import { recomputeCloseness } from "@/lib/enrichment/recompute";

// Call-result intake. The external transcription/analysis pipeline (Make:
// recorder → Drive → Whisper → AI) posts the finished transcript + analysis
// here; we APPEND it to the company's interaction timeline (append-only). Same
// per-app-key auth as /api/leads — the shared service-role key is NOT accepted.
//
// Two shapes share this route:
//   - company_id only (unchanged): a plain transcript/analysis append.
//   - lead_id + parsed (auto-outcome, 2026-09-18): the call-outcome skill's
//     read of a transcript. decideAutoOutcome (lib/calls/auto-outcome.ts) says
//     whether it may be applied; either way it routes through the ONE lead
//     write path (lib/leads/service.ts) — never a hand-rolled write here.

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

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/** Suggested-outcome description for the confirm task — every field is a suggestion, nothing is applied. */
function composeConfirmDescription(parsed: ParsedCall, reasonLabel: string): string {
  const pct = Math.round(parsed.confidence * 100);
  const parts = [
    reasonLabel,
    `Javasolt kimenetel: ${callOutcomeLabel(parsed.outcome)} (${pct}%)`,
    `Javasolt megjegyzés: ${parsed.note}`,
  ];
  if (parsed.callback_at) {
    parts.push(`Javasolt visszahívás: ${new Date(parsed.callback_at).toLocaleString("hu-HU")}`);
  }
  if (parsed.answers && Object.keys(parsed.answers).length > 0) {
    parts.push(
      `Javasolt válaszok: ${Object.entries(parsed.answers).map(([k, v]) => `${k}: ${v}`).join(", ")}`,
    );
  }
  return parts.join("\n");
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

  const parsedBody = callResultSchema.safeParse(raw);
  if (!parsedBody.success) {
    return json({ error: "Validation failed", details: parsedBody.error.flatten() }, 400);
  }
  const input = parsedBody.data;
  const tenantId = key.tenantId;

  if (input.lead_id && input.parsed) {
    return handleLeadOutcome(input, input.lead_id, input.parsed, key.appSlug, tenantId);
  }

  // ── Plain company_id path (unchanged) ──────────────────────────────────
  const company = await db.company.findFirst({
    where: { id: input.company_id, tenantId, deletedAt: null },
    select: { id: true },
  });
  if (!company) return json({ error: "Company not found" }, 404);

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
    await recomputeCloseness({ tenantId, companyId: company.id, personId: input.person_id ?? null });

    revalidatePath(`/companies/${company.id}`);
    if (input.person_id) revalidatePath(`/persons/${input.person_id}`);
    revalidatePath("/calls");

    return json({ ok: true, interactionId: interaction.id }, 201);
  } catch {
    return json({ error: "Failed to record call result" }, 500);
  }
}

async function handleLeadOutcome(
  input: CallResultInput,
  leadId: number,
  parsed: ParsedCall,
  appSlug: string,
  tenantId: number,
) {
  const lead = await db.lead.findFirst({
    where: { id: leadId, tenantId },
    select: {
      id: true,
      companyId: true,
      assignedToId: true,
      company: { select: { name: true } },
      contact: { select: { personId: true, person: { select: { firstName: true, lastName: true } } } },
    },
  });
  if (!lead) return json({ error: "Lead not found" }, 404);
  const personId = lead.contact?.personId ?? null;
  const who = lead.contact?.person
    ? `${lead.contact.person.lastName} ${lead.contact.person.firstName}`.trim()
    : lead.company?.name ?? `Lead #${leadId}`;

  // Idempotency: call_id is unique per tenant. A repeat post of the same call
  // must be a no-op, not a duplicate interaction/task.
  if (input.call_id) {
    const existing = await db.interaction.findFirst({
      where: { tenantId, callId: input.call_id },
      select: { id: true },
    });
    if (existing) return json({ ok: true, deduped: true, interactionId: existing.id }, 200);
  }

  // The queued row this post answers. Already parsed → someone beat us to it.
  let pending: { id: number; parsedAt: Date | null } | null = null;
  if (input.pending_interaction_id) {
    pending = await db.interaction.findFirst({
      where: { id: input.pending_interaction_id, tenantId, type: "call", outcome: "transcribed" },
      select: { id: true, parsedAt: true },
    });
    if (!pending) return json({ error: "Pending interaction not found" }, 404);
    if (pending.parsedAt) return json({ ok: true, deduped: true, interactionId: pending.id }, 200);
  }

  const now = new Date();
  const decision = decideAutoOutcome(parsed);
  const ctx: LeadCtx = { tenantId, userId: null, actor: "agent", actorAgentId: appSlug };

  let result: {
    applied: boolean;
    reason: string | null;
    interactionId: number;
    taskId: number | null;
    bookingTaskId: number | null;
    qualificationError?: string;
  };

  if (decision.apply) {
    const outcomeResult = await logLeadCallOutcome(leadId, toCallOutcome(parsed), ctx);
    if ("error" in outcomeResult) {
      // Do not fall through to applying anything — the write failed. File the
      // same confirm task a low-confidence parse would get, with the reason why.
      result = await createConfirmTask(
        tenantId, input, lead, personId, who, parsed,
        "apply_failed", `Alkalmazás sikertelen: ${outcomeResult.error}`, now, pending,
      );
    } else {
      try {
        await db.interaction.update({
          where: { id: outcomeResult.interactionId },
          // When the transcript came from the queue it already lives on the
          // pending row, which stays on the timeline — copying it here would
          // put the same text on the lead twice.
          data: { transcript: pending ? null : input.transcript ?? null, autoConfidence: parsed.confidence, callId: input.call_id ?? null, parsedAt: now },
        });
      } catch (err) {
        if (isUniqueViolation(err)) return json({ ok: true, deduped: true, interactionId: outcomeResult.interactionId }, 200);
        throw err;
      }
      let qualificationError: string | undefined;
      if (parsed.answers && Object.keys(parsed.answers).length > 0) {
        const qualResult = await setLeadQualification(leadId, parsed.answers, ctx);
        if ("error" in qualResult) qualificationError = qualResult.error;
      }
      result = {
        applied: true,
        reason: null,
        interactionId: outcomeResult.interactionId,
        taskId: outcomeResult.taskId,
        bookingTaskId: outcomeResult.bookingTaskId,
        ...(qualificationError ? { qualificationError } : {}),
      };
    }
  } else {
    result = await createConfirmTask(
      tenantId, input, lead, personId, who, parsed,
      decision.reason, AUTO_OUTCOME_REASON_LABEL[decision.reason], now, pending,
    );
  }

  // Applied path only: the confirm path already stamped the row it reused.
  if (pending && result.interactionId !== pending.id) {
    await db.interaction.update({
      where: { id: pending.id },
      data: { parsedAt: now, autoConfidence: parsed.confidence },
    });
  }

  await db.auditLog.create({
    data: {
      tenantId,
      actorUserId: null,
      action: "create",
      entityType: "interaction",
      entityId: result.interactionId,
      changes: {
        before: null,
        after: {
          type: "call",
          outcome: result.applied ? parsed.outcome : "transcribed",
          source: appSlug,
          callId: input.call_id ?? null,
          leadId,
          confidence: parsed.confidence,
        },
      } as Prisma.InputJsonValue,
    },
  });
  await recomputeCloseness({ tenantId, companyId: lead.companyId, personId });

  if (lead.companyId) revalidatePath(`/companies/${lead.companyId}`);
  if (personId) revalidatePath(`/persons/${personId}`);
  revalidatePath("/calls");
  revalidatePath("/drive");
  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/tasks");

  if (result.applied) {
    return json(
      {
        ok: true,
        applied: true,
        interactionId: result.interactionId,
        confidence: parsed.confidence,
        taskId: result.taskId,
        bookingTaskId: result.bookingTaskId,
        ...(result.qualificationError ? { qualificationError: result.qualificationError } : {}),
      },
      201,
    );
  }
  return json(
    {
      ok: true,
      applied: false,
      reason: result.reason,
      interactionId: result.interactionId,
      taskId: result.taskId,
      confidence: parsed.confidence,
    },
    201,
  );
}

/** Not applied (low confidence / human act / incomplete / apply failed): store the transcript + file a confirm task. */
async function createConfirmTask(
  tenantId: number,
  input: CallResultInput,
  lead: { id: number; companyId: number | null; assignedToId: number | null },
  personId: number | null,
  who: string,
  parsed: ParsedCall,
  reasonKey: string,
  reasonLabel: string,
  now: Date,
  /** The queued row this answers, when there is one — reused instead of duplicated. */
  pending: { id: number } | null,
) {
  const notes = composeCallNotes({
    analysis: parsed.note,
    transcript: input.transcript,
    durationSec: input.duration_sec,
    callId: input.call_id,
  });
  const occurredAt = input.occurred_at ? new Date(input.occurred_at) : now;

  const { interaction, task } = await db.$transaction(async (tx) => {
    // A dictated transcript is ALREADY an interaction on this lead's timeline.
    // Answering it with a second transcribed row would show the setter the same
    // call twice, so the queued row is updated in place instead.
    const interaction = pending
      ? await tx.interaction.update({
          where: { id: pending.id },
          data: { notes, autoConfidence: parsed.confidence, callId: input.call_id ?? null, parsedAt: now },
          select: { id: true },
        })
      : await tx.interaction.create({
      data: {
        tenantId,
        leadId: lead.id,
        companyId: lead.companyId,
        personId,
        type: "call",
        direction: "outbound",
        outcome: "transcribed",
        notes,
        transcript: input.transcript ?? null,
        autoConfidence: parsed.confidence,
        callId: input.call_id ?? null,
        parsedAt: now,
        occurredAt,
      },
      select: { id: true },
    });
    const task = await tx.task.create({
      data: {
        tenantId,
        leadId: lead.id,
        companyId: lead.companyId,
        personId,
        assignedToId: lead.assignedToId ?? null,
        title: `${AUTO_OUTCOME_LABELS.confirmTaskTitle}: ${who}`,
        description: composeConfirmDescription(parsed, reasonLabel),
        type: "call",
        category: "revenue_generating",
        status: "created",
        dueDate: now,
      },
      select: { id: true },
    });
    return { interaction, task };
  });

  return { applied: false, reason: reasonKey, interactionId: interaction.id, taskId: task.id, bookingTaskId: null };
}
