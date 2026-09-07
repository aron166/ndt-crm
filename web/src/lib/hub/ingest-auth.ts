import { validateAppKey } from "@/lib/app-key-auth";

// Auth for the ecosystem-hub ingestion routes (/api/events, /api/conversations).
// A scoped per-app key (app_api_keys) is the ONLY accepted credential: it carries
// the tenant and the sourceApp, so neither can come from the request body. The
// shared Supabase service-role key path was removed (Codex review 2026-09-04,
// Batch A #3) — mint a helm_ key under Settings → API kulcsok per caller.

export interface IngestContext {
  tenantId: number;
  appSlug: string;
  /** Rate-limit bucket. */
  keyId: number;
}

export async function authenticateIngest(request: Request): Promise<IngestContext | null> {
  const key = await validateAppKey(request);
  return key ? { tenantId: key.tenantId, appSlug: key.appSlug, keyId: key.keyId } : null;
}
