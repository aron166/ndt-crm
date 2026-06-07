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
}

/**
 * Validate the Authorization: Bearer <key> header against app_api_keys.
 * Returns the key context on success, or null (caller responds 401).
 * Updates last_used_at as a side effect. Does NOT accept the service-role key.
 */
export async function validateAppKey(request: Request): Promise<AppKeyContext | null> {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;

  const plaintext = auth.slice(7).trim();
  if (!plaintext) return null;

  const keyHash = hashAppKey(plaintext);
  const record = await db.appApiKey.findUnique({
    where: { keyHash },
    select: { id: true, tenantId: true, appSlug: true, isActive: true, keyHash: true },
  });

  if (!record || !record.isActive) return null;

  // Constant-time compare the hashes — defends against any timing leak even
  // though the lookup is already by hash.
  const a = Buffer.from(record.keyHash);
  const b = Buffer.from(keyHash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  // Fire-and-forget; a failed touch must never reject a valid request.
  void db.appApiKey
    .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return { keyId: record.id, tenantId: record.tenantId, appSlug: record.appSlug };
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
