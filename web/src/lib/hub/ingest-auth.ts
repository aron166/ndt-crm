import { validateAppKey } from "@/lib/app-key-auth";
import { validateServiceKey } from "@/lib/service-auth";

// Auth for the ecosystem-hub ingestion routes (/api/events, /api/conversations).
//
// Preferred: a scoped per-app key (app_api_keys) — it carries its own tenant and
// appSlug, closing Platform Foundation #4 for these routes. Transitional: the
// shared Supabase service-role key is still accepted so existing callers don't
// break, but it is DEPRECATED — remove `legacyServiceKey` once every portfolio
// app posts with its own helm_ key.

export interface IngestContext {
  /** Authoritative for app-key callers; provisional (body may override) on the legacy path. */
  tenantId: number;
  /** The key's appSlug; null on the legacy service-key path. */
  appSlug: string | null;
  /** Rate-limit bucket — real key id, or 0 for the shared service key. */
  keyId: number;
  legacyServiceKey: boolean;
}

export async function authenticateIngest(
  request: Request,
  route: string,
): Promise<IngestContext | null> {
  const key = await validateAppKey(request);
  if (key) {
    return {
      tenantId: key.tenantId,
      appSlug: key.appSlug,
      keyId: key.keyId,
      legacyServiceKey: false,
    };
  }

  if (validateServiceKey(request)) {
    console.warn(
      `[${route}] DEPRECATED: authenticated with the shared service-role key. ` +
        "Mint a per-app key under Settings → API kulcsok and switch this caller.",
    );
    return { tenantId: 1, appSlug: null, keyId: 0, legacyServiceKey: true };
  }

  return null;
}
