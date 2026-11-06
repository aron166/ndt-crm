import { z } from "zod";
import { NextResponse } from "next/server";
import { json, requireAppKey } from "@/lib/api/http";
import { dossierSchema } from "./dossier";

// Shared bits of the enrichment write API (/api/companies/:id, /api/persons/:id).
// Same per-app-key auth as the lead ingestion routes: the key carries the
// tenant; the service-role key is NOT accepted. snake_case on the wire.

export interface EnrichmentCtx {
  tenantId: number;
  actorAgentId: string;
}

/** Authenticate + rate-limit; returns the ctx or the error response. */
export async function enrichmentApiCtx(request: Request): Promise<{ ctx: EnrichmentCtx } | { res: NextResponse }> {
  const key = await requireAppKey(request);
  if (key instanceof NextResponse) return { res: key };
  return { ctx: { tenantId: key.tenantId, actorAgentId: key.appSlug } };
}


const enrichmentBodySchema = z
  .object({
    enrichment: dossierSchema.nullable(),
  })
  .strict();

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
