import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Signed, tamper-proof link payloads for the public nurture routes (unsubscribe,
// click). The key is derived from ENCRYPTION_KEY with a purpose label, so a token
// for one purpose never verifies for another and no new secret is needed.

function key(purpose: string): Buffer {
  const base = process.env.ENCRYPTION_KEY;
  if (!base) throw new Error("ENCRYPTION_KEY missing");
  return createHmac("sha256", Buffer.from(base, "hex")).update(`nurture:${purpose}`).digest();
}

export function signPayload(purpose: "unsub" | "click", payload: Record<string, unknown>): { d: string; s: string } {
  const d = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const s = createHmac("sha256", key(purpose)).update(d).digest("base64url");
  return { d, s };
}

export function verifyPayload<T>(purpose: "unsub" | "click", d: string | null, s: string | null): T | null {
  if (!d || !s || d.length > 4000) return null;
  const want = createHmac("sha256", key(purpose)).update(d).digest();
  let got: Buffer;
  try { got = Buffer.from(s, "base64url"); } catch { return null; }
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try { return JSON.parse(Buffer.from(d, "base64url").toString("utf8")) as T; } catch { return null; }
}
