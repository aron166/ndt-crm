import { z } from "zod";
import { db } from "@/lib/db";
import { reportError } from "@/lib/report-error";
import { json, leadApiCtx, readJson } from "@/lib/leads/api";
import { logLeadCallOutcome } from "@/lib/leads/service";
import { AssistantError, assistantConfig, chatCompletion, estimateCostUsd } from "@/lib/assistant/provider";
import { capState } from "@/lib/assistant/cap";
import {
  CALLNOTE_JSON_SCHEMA, callNoteCallId, callNotePrompt, parseCallNote, toCallOutcomeInput,
} from "@/lib/assistant/callnote";
import { resolveCallNoteLead } from "@/lib/assistant/callnote-lead";

/**
 * POST /api/assistant/callnote (docs/api.md "Assistant: call-note ingest"). App-key auth,
 * tenant from the key. Transcript -> provider (strict JSON schema) -> validated note ->
 * lead resolution -> proposal, or with apply:true the same logLeadCallOutcome the modal uses.
 */
const bodySchema = z.object({
  transcript: z.string().trim().min(1).max(12_000),
  lead_id: z.number().int().positive().optional(),
  company: z.string().trim().max(300).optional(),
  person: z.string().trim().max(300).optional(),
  occurred_at: z.string().datetime({ offset: true }).optional(),
  now: z.string().datetime({ offset: true }).optional(),
  apply: z.boolean().optional(),
});

const ROUTE = "/api/assistant/callnote";
const bpNow = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Budapest", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "long", hourCycle: "h23",
  }).format(d);

export async function POST(request: Request) {
  const auth = await leadApiCtx(request);
  if ("res" in auth) return auth.res;
  const { tenantId } = auth.ctx;
  const allowed = (process.env.ASSISTANT_CALLNOTE_APPS ?? "callnotes").split(",").map((s) => s.trim()).filter(Boolean);
  if (!auth.ctx.actorAgentId || !allowed.includes(auth.ctx.actorAgentId)) return json({ error: "App key not allowed for call notes" }, 403);
  const raw = await readJson(request);
  if (raw instanceof Response) return raw;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
  const b = parsed.data;

  const callId = callNoteCallId(b.transcript, b.lead_id != null ? `lead:${b.lead_id}` : `company:${b.company ?? ""}`);
  try {
    // Idempotency: the same transcript for the same lead/company was already applied -> no model call, no second write.
    const prior = await db.interaction.findFirst({ where: { tenantId, callId }, select: { id: true, leadId: true } });
    if (prior && b.apply) return json({ ok: true, applied: true, existed: true, interaction_id: prior.id, lead_id: prior.leadId });
    if (b.lead_id != null) {
      const res = await resolveCallNoteLead(tenantId, b.lead_id, "");
      if (!res.ok) return json({ error: res.error }, res.status);
    }

    const cfg = assistantConfig();
    if (!cfg) return json({ error: "Assistant not configured (ASSISTANT_API_KEY)" }, 503);
    if ((await capState(tenantId)).exceeded) return json({ error: "Monthly assistant token cap reached" }, 503);

    const log = (p: number, c: number) =>
      db.assistantCall.create({
        data: {
          tenantId, userId: null, page: ROUTE, purpose: "callnote", action: auth.ctx.actorAgentId ?? null, model: cfg.model,
          promptTokens: p, completionTokens: c, costUsd: estimateCostUsd(p, c),
        },
      });
    let r;
    try {
      r = await chatCompletion(cfg, [{ role: "user", content: callNotePrompt(b.transcript, bpNow(b.now ? new Date(b.now) : new Date())) }], {
        schema: { name: "call_note", schema: CALLNOTE_JSON_SCHEMA }, maxTokens: 1500,
      });
    } catch (e) {
      if (e instanceof AssistantError && e.usage) await log(e.usage.promptTokens, e.usage.completionTokens);
      if (e instanceof AssistantError && e.status === 429) return json({ error: "Provider rate limited, retry in a minute" }, 429);
      reportError("api.assistant.callnote.provider", e, { tenantId });
      return json({ error: "Assistant provider failed" }, 502);
    }
    await log(r.promptTokens, r.completionTokens);

    const note = parseCallNote(r.text);
    if (!note.ok) return json({ error: note.error, issues: note.issues }, 422);
    const proposed = { ...note.note, person: note.note.person ?? b.person ?? null };
    const lead = await resolveCallNoteLead(tenantId, b.lead_id ?? null, b.company ?? proposed.company);
    if (!lead.ok) return json({ error: lead.error, proposed, candidates: lead.candidates }, lead.status);

    const payload = toCallOutcomeInput(proposed, { transcript: b.transcript, callId, ...(b.occurred_at ? { occurredAt: new Date(b.occurred_at) } : {}) });
    if (!b.apply) return json({ ok: true, applied: false, lead_id: lead.leadId, proposed, payload });

    const res = await logLeadCallOutcome(lead.leadId, payload, auth.ctx);
    if ("error" in res) {
      return json({ error: res.error, ...("issues" in res ? { details: res.issues } : {}) }, res.error === "Lead nem található" ? 404 : 400);
    }
    return json({ ok: true, applied: true, lead_id: lead.leadId, interaction_id: res.interactionId, task_id: res.taskId }, 201);
  } catch (err) {
    // A concurrent duplicate trips the unique call_id inside the transaction: report it as the replay it is.
    if ((err as { code?: string })?.code === "P2002") {
      const dup = await db.interaction.findFirst({ where: { tenantId, callId }, select: { id: true, leadId: true } }).catch(() => null);
      if (dup) return json({ ok: true, applied: true, existed: true, interaction_id: dup.id, lead_id: dup.leadId });
      return json({ error: "Duplicate transcript (already applied)" }, 409);
    }
    reportError("api.assistant.callnote", err, { tenantId });
    return json({ error: "Internal error" }, 500);
  }
}
