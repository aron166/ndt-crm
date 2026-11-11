import type { SupabaseClient } from "@supabase/supabase-js";

export interface SessionClaims {
  /** auth.users.id */
  sub: string;
  email: string | null;
}

/**
 * The signed-in session, verified locally: the project signs with ES256, so getClaims checks the access token
 * against the cached JWKS instead of an Auth server round trip per call (getUser did one; 58 ms median measured
 * 2026-11-10). An expired session is still refreshed through the client's cookie handlers.
 * Trade-off: a session revoked, deleted or banned in Supabase stays valid until its access token expires
 * (Supabase default 1 h); the CRM users allow-list still cuts access within its 60 s cache.
 * getClaims throws (not returns) on a malformed token; any failure means "no session", never a 500.
 */
export async function sessionClaims(supabase: Pick<SupabaseClient, "auth">): Promise<SessionClaims | null> {
  try {
    const { data } = await supabase.auth.getClaims();
    const c = data?.claims;
    if (!c || typeof c.sub !== "string") return null;
    return { sub: c.sub, email: typeof c.email === "string" ? c.email : null };
  } catch {
    return null;
  }
}
