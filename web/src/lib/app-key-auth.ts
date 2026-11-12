import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { db } from "./db";

// Per-app ingestion key auth (Platform Foundation #4).
//
// Public ingestion routes (e.g. POST /api/leads) authenticate with a scoped,
// hashed, revocable per-app key — NOT the shared Supabase service-role key.
// Only the SHA-256 hash is ever stored; the plaintext is shown to the operator
// exactly once at creation.

const KEY_PREFIX = "helm_";

/** Generate a fresh plaintext key. Shown to the operator once, never stored. */
export function generateAppKey(): string {
  return KEY_PREFIX + randomBytes(24).toString("hex");
}

/** SHA-256 hex of a plaintext key — the only form we persist. */
export function hashAppKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

export interface AppKeyContext {
  keyId: number;
  tenantId: number;
  appSlug: string;
  /** null = legacy key (no restriction); otherwise the scopes it holds. */
  scopes: AppKeyScope[] | null;
}

export const APP_KEY_SCOPES = ["leads:write", "prospects:write", "read"] as const;
export type AppKeyScope = (typeof APP_KEY_SCOPES)[number];

/** null/undefined = legacy key; any other string keeps only known scopes (empty or all-unknown = a key that may do nothing). */
export function parseScopes(raw: string | null | undefined): AppKeyScope[] | null {
  if (raw == null) return null;
  const known = raw.split(/\s+/).filter((t): t is AppKeyScope => (APP_KEY_SCOPES as readonly string[]).includes(t));
  return [...new Set(known)];
}

const MEMBERS_PATH = /^\/api\/campaigns\/[A-Za-z0-9_-]{1,80}\/members$/;

/** The scope a request needs. "legacy" = only unscoped keys may call it. */
export function requiredScope(method: string, pathname: string): AppKeyScope | "legacy" {
  if (method === "POST" && (pathname === "/api/leads" || pathname === "/api/events")) return "leads:write";
  if ((method === "POST" || method === "DELETE") && MEMBERS_PATH.test(pathname)) return "prospects:write";
  if (method === "GET" || method === "HEAD") return "read";
  return "legacy";
}

export function keyAllows(scopes: AppKeyScope[] | null, required: AppKeyScope | "legacy"): boolean {
  return scopes == null || (required !== "legacy" && scopes.includes(required));
}

/**
 * Validate the Authorization: Bearer <key> header against app_api_keys.
 * Returns the key context on success, or null (caller responds 401).
 * Null also when a scoped key is not valid for this route. Updates last_used_at as a side effect. Does NOT accept the service-role key.
 */
export async function validateAppKey(request: Request): Promise<AppKeyContext | null> {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;

  const plaintext = auth.slice(7).trim();
  if (!plaintext) return null;

  const keyHash = hashAppKey(plaintext);
  const record = await db.appApiKey.findUnique({
    where: { keyHash },
    select: { id: true, tenantId: true, appSlug: true, isActive: true, keyHash: true, scopes: true },
  });

  if (!record || !record.isActive) return null;

  // Constant-time compare the hashes — defends against any timing leak even
  // though the lookup is already by hash.
  const a = Buffer.from(record.keyHash);
  const b = Buffer.from(keyHash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  // A scoped key on a route outside its scopes is refused like a bad key (callers answer 401).
  const scopes = parseScopes(record.scopes);
  if (!keyAllows(scopes, requiredScope(request.method, new URL(request.url).pathname))) return null;

  // Fire-and-forget; a failed touch must never reject a valid request.
  void db.appApiKey
    .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return { keyId: record.id, tenantId: record.tenantId, appSlug: record.appSlug, scopes };
}

// ── Naive in-memory rate limit: 30 requests / minute per key ──────────────────
// Per-process and best-effort (resets on redeploy, not shared across instances).
// Good enough as a courtesy throttle; the key itself is the real gate.
const RATE_LIMIT = 30;
const WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();

export function rateLimit(keyId: number): boolean {
  const now = Date.now();
  const id = String(keyId);
  const recent = (hits.get(id) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    hits.set(id, recent);
    return false;
  }
  recent.push(now);
  hits.set(id, recent);
  return true;
}
