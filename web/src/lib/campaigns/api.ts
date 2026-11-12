// Campaign API: auth, wire schemas, response helpers (docs/api.md "Campaigns").
// Two callers: an app key (agents; tenant from the key) or a session CRM user (tenant 1).
// Session-only routes ignore a bearer key entirely, so a key can never reach them.

import { NextResponse } from "next/server";
import { z } from "zod";
import { validateAppKey, rateLimit } from "@/lib/app-key-auth";
import { getActor, NOT_A_CRM_USER } from "@/lib/actor";
import { CONTENT_CATEGORIES } from "@/lib/content/types";
import { AUDIENCE_RULES, AUDIENCE_SOURCES, CAMPAIGN_KINDS, DAILY_CAP_MAX, OUTCOME_KEYS, STEP_CHANNELS } from "./rules";
import type { CampaignCtx, Fail } from "./service";

// Single tenant for sessions today (decisions.md #12); app keys carry their own tenant.
const SESSION_TENANT_ID = 1;

export function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

export function failRes(r: Fail) {
  return json({ error: r.error }, r.status);
}

export async function campaignCtx(request: Request, opts: { sessionOnly?: boolean } = {}): Promise<{ ctx: CampaignCtx } | { res: NextResponse }> {
  if (!opts.sessionOnly && request.headers.get("authorization")) {
    const key = await validateAppKey(request);
    if (!key) return { res: json({ error: "Unauthorized" }, 401) };
    if (!rateLimit(key.keyId)) return { res: json({ error: "Rate limit exceeded (30 req/min)" }, 429) };
    return { ctx: { tenantId: key.tenantId, userId: null, appSlug: key.appSlug, scopes: key.scopes } };
  }
  const { userId } = await getActor(SESSION_TENANT_ID);
  if (userId == null) return { res: json({ error: NOT_A_CRM_USER }, 403) };
  return { ctx: { tenantId: SESSION_TENANT_ID, userId } };
}

export async function body<T>(request: Request, schema: z.ZodType<T>): Promise<{ data: T } | { res: NextResponse }> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { res: json({ error: "Invalid JSON" }, 400) };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { res: json({ error: "Validation failed", details: parsed.error.flatten() }, 400) };
  return { data: parsed.data };
}

export const slugParam = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/);

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const json_ = z.record(z.string(), z.unknown());

export const stepSchema = z.object({
  channel: z.enum(STEP_CHANNELS),
  wait_days: z.number().int().min(0).max(60).optional(),
  audience_rule: z.enum(AUDIENCE_RULES).optional(),
  content_item_id: z.number().int().positive().nullable().optional(),
});
export const stepsSchema = z.array(stepSchema).max(20);

export const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  kind: z.enum(CAMPAIGN_KINDS),
  slug: z.string().trim().max(60).optional(),
  owner_user_id: z.number().int().positive().nullable().optional(),
  daily_cap: z.number().int().min(1).max(DAILY_CAP_MAX).optional(),
  starts_on: ymd.nullable().optional(),
  ends_on: ymd.nullable().optional(),
  project: z.string().trim().max(60).nullable().optional(),
  brief: json_.optional(),
  audience: json_.optional(),
  steps: stepsSchema.optional(),
});

export const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  daily_cap: z.number().int().min(1).max(DAILY_CAP_MAX).optional(),
  owner_user_id: z.number().int().positive().nullable().optional(),
  starts_on: ymd.nullable().optional(),
  ends_on: ymd.nullable().optional(),
  brief: json_.optional(),
  adopt_brief_proposal: z.boolean().optional(),
  outbound_automations: z.boolean().optional(),
  /** Who the campaign touches (item 4): prospects from a list, or open leads in chosen stages. */
  audience: z.object({ source: z.enum(AUDIENCE_SOURCES), stages: z.array(z.string().trim().min(1).max(40)).max(20).optional() }).optional(),
}).refine((p) => Object.keys(p).length > 0, "empty patch");

export const specifySchema = z.object({
  brief: json_.optional(),
  steps: stepsSchema.optional(),
  assets: z.array(z.object({
    title: z.string().trim().min(1).max(200),
    body: z.string().min(1),
    category: z.enum(CONTENT_CATEGORIES),
    channel: z.string().trim().min(1).max(40),
    content_type: z.string().trim().min(1).max(40),
    format: z.string().trim().max(40).nullable().optional(),
    purpose: z.string().trim().max(200).nullable().optional(),
    step_position: z.number().int().min(1).max(20).optional(),
  })).max(10).optional(),
  note: z.string().trim().max(1000).optional(),
});

export const outcomeSchema = z.object({
  member_id: z.number().int().positive(),
  outcome: z.string().refine((v) => OUTCOME_KEYS.includes(v), "unknown outcome"),
  notes: z.string().trim().max(2000).optional(),
  duration_sec: z.number().int().min(0).max(4 * 3600).optional(),
  followup_date: ymd.optional(),
  email: z.string().trim().email().max(200).optional(),
});
