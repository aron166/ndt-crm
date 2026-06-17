import { z } from "zod";

// Inbound call-result payload (POST /api/calls/result). After a call is recorded
// and transcribed/analyzed by the external pipeline (Make scenario: recorder →
// Drive → Whisper transcript → AI analysis), it posts the result back here. We
// APPEND a new Interaction (interactions are append-only) onto the company's
// timeline. snake_case on the wire to match the other ingestion endpoints.

const emptyToUndef = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? undefined : v;

export const callResultSchema = z
  .object({
    // Which company/person the call belonged to. The Make scenario carries these
    // through from the call-started webhook (keep the mapping in a Make data store).
    company_id: z.coerce.number().int().positive(),
    person_id: z.preprocess(emptyToUndef, z.coerce.number().int().positive().optional()),
    // Free-form correlation id from the call-started webhook; stored for traceability.
    call_id: z.preprocess(emptyToUndef, z.string().trim().max(200).optional()),
    transcript: z.preprocess(emptyToUndef, z.string().trim().max(100_000).optional()),
    analysis: z.preprocess(emptyToUndef, z.string().trim().max(50_000).optional()),
    duration_sec: z.preprocess(emptyToUndef, z.coerce.number().int().nonnegative().optional()),
    // When the call happened (ISO). Defaults to now if omitted.
    occurred_at: z.preprocess(emptyToUndef, z.string().datetime().optional()),
  })
  .refine((d) => Boolean(d.transcript || d.analysis), {
    message: "transcript or analysis is required",
  });

export type CallResultInput = z.infer<typeof callResultSchema>;

/** Compose the Interaction.notes body from the analysis + transcript + duration. */
export function composeCallNotes(input: {
  analysis?: string;
  transcript?: string;
  durationSec?: number;
  callId?: string;
}): string {
  const parts: string[] = [];
  if (typeof input.durationSec === "number") {
    parts.push(`Időtartam: ${formatDuration(input.durationSec)}`);
  }
  if (input.analysis) parts.push(`[AI elemzés]\n${input.analysis}`);
  if (input.transcript) parts.push(`[Átirat]\n${input.transcript}`);
  if (input.callId) parts.push(`(call: ${input.callId})`);
  return parts.join("\n\n");
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
