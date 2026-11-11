import { z } from "zod";
import { NextResponse } from "next/server";
import { validateAppKey, rateLimit } from "@/lib/app-key-auth";
import type { LeadCtx } from "./service";
import { CALL_TYPE_KEYS, LEAD_OUTCOMES, LOST_REASON_MIN, LOST_REASON_MAX } from "./outcomes";
import { answersRecordSchema } from "./qualification";
import { LOST_REASONS, LOST_NOTE_MAX, OFFER_TYPES, RECALL_REASONS } from "./lifecycle";

// Shared bits of the lead write API (/api/leads/:id*). Same per-app-key auth
// as POST /api/leads: the key carries the tenant; the service-role key is NOT
// accepted. snake_case on the wire like the other public ingestion routes.

export function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

/** Authenticate + rate-limit; returns the LeadCtx or the error response. */
export async function leadApiCtx(request: Request): Promise<{ ctx: LeadCtx } | { res: NextResponse }> {
  const key = await validateAppKey(request);
  if (!key) return { res: json({ error: "Unauthorized" }, 401) };
  if (!rateLimit(key.keyId)) return { res: json({ error: "Rate limit exceeded (30 req/min)" }, 429) };
  return { ctx: { tenantId: key.tenantId, userId: null, actor: "agent", actorAgentId: key.appSlug } };
}

export function parseLeadId(raw: string): number | null {
  return /^\d+$/.test(raw) ? parseInt(raw, 10) : null;
}

export async function readJson(request: Request): Promise<unknown | NextResponse> {
  try {
    return await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
}

const emptyToUndef = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optInt = z.preprocess(emptyToUndef, z.coerce.number().int().positive().optional());

export const PAGE_SIZE_MAX = 100;
export const leadListQuerySchema = z.object({
  status: z.preprocess(emptyToUndef, z.string().trim().max(64).optional()),
  outcome: z.preprocess(emptyToUndef, z.enum(LEAD_OUTCOMES).optional()),
  assigned_to: optInt,
  /** Name search: company name, contact person name, email or phone (contact or person), subject (contains, case-insensitive). */
  q: z.preprocess(emptyToUndef, z.string().trim().min(2).max(100).optional()),
  /** Campaign / import batch tag, exact (e.g. launch-2026-11). */
  campaign: z.preprocess(emptyToUndef, z.string().trim().max(200).optional()),
  page: z.preprocess(emptyToUndef, z.coerce.number().int().positive().default(1)),
  page_size: z.preprocess(emptyToUndef, z.coerce.number().int().positive().max(PAGE_SIZE_MAX).default(25)),
});

/** The where-fragment for `q=`; pure so the matched columns are pinned by a test. */
export function leadSearchWhere(q: string) {
  const c = { contains: q, mode: "insensitive" as const };
  return {
    OR: [
      { company: { name: c } },
      { contact: { person: { OR: [{ firstName: c }, { lastName: c }, { email: c }, { phone: c }] } } },
      { contact: { email: c } },
      { contact: { phone: c } },
      { subject: c },
    ],
  };
}

export const leadPatchSchema = z
  .object({
    status: z.string().trim().min(1).max(64).optional(),
    // W2 stage-move details, read only together with `status` (lib/leads/lifecycle.ts).
    event: z.string().trim().min(1).max(64).optional(),
    next_action: z.string().trim().min(1).max(500).optional(),
    next_due: z.coerce.date().optional(),
    offer_type: z.enum(OFFER_TYPES).optional(),
    lost_code: z.enum(LOST_REASONS).optional(),
    lost_note: z.string().trim().max(LOST_NOTE_MAX).optional(),
    recall_reason: z.enum(RECALL_REASONS).optional(),
    recall_date: z.coerce.date().optional(),
    outcome: z.enum(LEAD_OUTCOMES).optional(),
    lost_reason: z.string().trim().min(LOST_REASON_MIN).max(LOST_REASON_MAX).optional(),
    assigned_to_id: z.number().int().positive().nullable().optional(),
    /** Shallow-merged into lead.custom_fields (null value deletes a key). */
    custom_fields: z.record(z.string().max(100), z.unknown()).optional(),
    /**
     * Setter answers, merged into lead.qualification. Keys must be slugs the
     * tenant currently asks about (validated server-side against the question
     * list); an empty string clears an answer.
     */
    qualification: answersRecordSchema.optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "Empty patch" })
  .refine((d) => d.status !== undefined || [d.event, d.next_action, d.next_due, d.offer_type, d.lost_code, d.lost_note, d.recall_reason, d.recall_date].every((v) => v === undefined), {
    message: "stage-move fields require status", path: ["status"],
  })
  // lost_reason is only read by setLeadOutcome; alone it would 200 with an unchanged lead.
  .refine((d) => d.lost_reason === undefined || d.outcome === "lost", {
    message: "lost_reason requires outcome=lost", path: ["lost_reason"],
  })
  // …and the other direction: closing a lead as lost without saying why is exactly
  // the gap Péter flagged. setLeadOutcome enforces it too (an already-lost lead may
  // reuse its stored reason), this makes the API say so up front.
  .refine((d) => d.outcome !== "lost" || d.lost_reason !== undefined, {
    message: "outcome=lost requires lost_reason", path: ["lost_reason"],
  })
  .refine((d) => new TextEncoder().encode(JSON.stringify(d.custom_fields ?? {})).length <= 16 * 1024, {
    message: "custom_fields exceeds 16KB", path: ["custom_fields"],
  });
export type LeadPatch = z.infer<typeof leadPatchSchema>;

/** Wire form of the call-outcome payload → the shared callOutcomeSchema shape. */
export const leadInteractionWireSchema = z.object({
  outcome: z.string(),
  note: z.string().optional(),
  callback_at: z.preprocess(emptyToUndef, z.string().optional()),
  demo_with: z.preprocess(emptyToUndef, z.string().optional()),
  booking_at: z.preprocess(emptyToUndef, z.string().optional()),
  booking_kind: z.preprocess(emptyToUndef, z.string().optional()),
  lost_reason: z.preprocess(emptyToUndef, z.string().optional()),
  assigned_to_id: optInt,
  script_variant: z.preprocess(emptyToUndef, z.string().optional()),
  call_type: z.preprocess(emptyToUndef, z.enum(CALL_TYPE_KEYS).optional()),
  /** Idempotency key, unique per tenant: a repeated POST with the same call_id writes nothing (409). */
  call_id: z.preprocess(emptyToUndef, z.string().trim().max(200).optional()),
});
export function toCallOutcomeInput(w: z.infer<typeof leadInteractionWireSchema>) {
  return {
    outcome: w.outcome,
    note: w.note,
    ...(w.callback_at ? { callbackAt: w.callback_at } : {}),
    ...(w.demo_with ? { demoWith: w.demo_with } : {}),
    ...(w.booking_at ? { bookingAt: w.booking_at } : {}),
    ...(w.booking_kind ? { bookingKind: w.booking_kind } : {}),
    ...(w.lost_reason ? { lostReason: w.lost_reason } : {}),
    ...(w.assigned_to_id ? { assignedToId: w.assigned_to_id } : {}),
    ...(w.script_variant ? { scriptVariant: w.script_variant } : {}),
    ...(w.call_type ? { callType: w.call_type } : {}),
    ...(w.call_id ? { callId: w.call_id } : {}),
  };
}

export const LEAD_API_SELECT = {
  id: true, status: true, outcome: true, closedAt: true, lostReason: true,
  assignedToId: true, source: true, sourceApp: true, channel: true, campaign: true,
  subject: true, serviceInterest: true, message: true, estimatedValue: true,
  customFields: true, qualification: true, tier: true, convertedDealId: true, receivedDate: true, createdAt: true,
  buyerType: true, intent: true, offerType: true, attempts: true, nextAction: true, nextDue: true,
  statusEnteredAt: true, recallReason: true, recallDate: true, lostNote: true, demoDoneAt: true, demoCreditUntil: true,
  company: { select: { id: true, name: true, city: true, vatNumber: true } },
  contact: {
    select: {
      id: true, role: true, email: true, phone: true,
      person: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
    },
  },
} as const;
