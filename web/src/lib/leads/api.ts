import { z } from "zod";
import { NextResponse } from "next/server";
import { validateAppKey, rateLimit } from "@/lib/app-key-auth";
import type { LeadCtx } from "./service";
import { LEAD_OUTCOMES } from "./outcomes";

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
  page: z.preprocess(emptyToUndef, z.coerce.number().int().positive().default(1)),
  page_size: z.preprocess(emptyToUndef, z.coerce.number().int().positive().max(PAGE_SIZE_MAX).default(25)),
});

export const leadPatchSchema = z
  .object({
    status: z.string().trim().min(1).max(64).optional(),
    outcome: z.enum(LEAD_OUTCOMES).optional(),
    lost_reason: z.string().trim().max(500).optional(),
    assigned_to_id: z.number().int().positive().nullable().optional(),
    /** Shallow-merged into lead.custom_fields (null value deletes a key). */
    custom_fields: z.record(z.string().max(100), z.unknown()).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "Empty patch" })
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
  assigned_to_id: optInt,
});
export function toCallOutcomeInput(w: z.infer<typeof leadInteractionWireSchema>) {
  return {
    outcome: w.outcome,
    note: w.note,
    ...(w.callback_at ? { callbackAt: w.callback_at } : {}),
    ...(w.demo_with ? { demoWith: w.demo_with } : {}),
    ...(w.assigned_to_id ? { assignedToId: w.assigned_to_id } : {}),
  };
}

export const LEAD_API_SELECT = {
  id: true, status: true, outcome: true, closedAt: true, lostReason: true,
  assignedToId: true, source: true, sourceApp: true, channel: true, campaign: true,
  subject: true, serviceInterest: true, message: true, estimatedValue: true,
  customFields: true, convertedDealId: true, receivedDate: true, createdAt: true,
  company: { select: { id: true, name: true, city: true, vatNumber: true } },
  contact: {
    select: {
      id: true, role: true, email: true, phone: true,
      person: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
    },
  },
} as const;
