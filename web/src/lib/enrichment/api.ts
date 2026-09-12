import { z } from "zod";
import { NextResponse } from "next/server";
import { validateAppKey, rateLimit } from "@/lib/app-key-auth";
import { dossierSchema } from "./dossier";

// Shared bits of the enrichment write API (/api/companies/:id, /api/persons/:id).
// Same per-app-key auth as the lead ingestion routes: the key carries the
// tenant; the service-role key is NOT accepted. snake_case on the wire.

export function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

export interface EnrichmentCtx {
  tenantId: number;
  actorAgentId: string;
}

/** Authenticate + rate-limit; returns the ctx or the error response. */
export async function enrichmentApiCtx(request: Request): Promise<{ ctx: EnrichmentCtx } | { res: NextResponse }> {
  const key = await validateAppKey(request);
  if (!key) return { res: json({ error: "Unauthorized" }, 401) };
  if (!rateLimit(key.keyId)) return { res: json({ error: "Rate limit exceeded (30 req/min)" }, 429) };
  return { ctx: { tenantId: key.tenantId, actorAgentId: key.appSlug } };
}

export function parseEntityId(raw: string): number | null {
  return /^\d+$/.test(raw) ? parseInt(raw, 10) : null;
}

export async function readJson(request: Request): Promise<unknown | NextResponse> {
  try {
    return await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
}

const enrichmentBodySchema = z.object({
  enrichment: dossierSchema.nullable(),
});

/**
 * Parses `{ enrichment: <dossier|null> }`. `closeness_score` is CRM-computed:
 * a caller sending it (any value) is rejected with its own message BEFORE
 * dossier validation runs, so the mistake is never confused with a dossier
 * shape error.
 */
export function parseEnrichmentBody(raw: unknown): { enrichment: z.infer<typeof dossierSchema> | null } | NextResponse {
  if (raw && typeof raw === "object" && "closeness_score" in raw) {
    return json({ error: "closeness_score is computed by the CRM and cannot be set" }, 400);
  }
  const parsed = enrichmentBodySchema.safeParse(raw);
  if (!parsed.success) return json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
  return parsed.data;
}
