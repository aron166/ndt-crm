import { describe, it, expect, vi, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import { signPayload, verifyPayload, TOKEN_TTL_MS } from "./token";

vi.mock("server-only", () => ({}));

const KEY = "ab".repeat(32);
afterEach(() => vi.unstubAllEnvs());

describe("outreach token", () => {
  it("refuses a non-hex or short ENCRYPTION_KEY (Vanda #196-3)", () => {
    vi.stubEnv("ENCRYPTION_KEY", "not-hex-at-all");
    expect(() => signPayload("unsub", { t: 1 })).toThrow("ENCRYPTION_KEY");
    vi.stubEnv("ENCRYPTION_KEY", "ab".repeat(16));
    expect(() => signPayload("unsub", { t: 1 })).toThrow("ENCRYPTION_KEY");
  });
  it("round-trips", () => {
    vi.stubEnv("ENCRYPTION_KEY", KEY);
    const { d, s } = signPayload("unsub", { t: 1, e: "a@b.hu" });
    expect(verifyPayload("unsub", d, s)).toMatchObject({ t: 1, e: "a@b.hu" });
  });
  it("rejects tampered d or s", () => {
    vi.stubEnv("ENCRYPTION_KEY", KEY);
    const { d, s } = signPayload("unsub", { t: 1 });
    const d2 = Buffer.from(JSON.stringify({ t: 2 })).toString("base64url");
    expect(verifyPayload("unsub", d2, s)).toBeNull();
    expect(verifyPayload("unsub", d, s.slice(0, -2) + (s.endsWith("AA") ? "BB" : "AA"))).toBeNull();
    expect(verifyPayload("unsub", d, null)).toBeNull();
    expect(verifyPayload("unsub", null, s)).toBeNull();
  });
  it("does not verify an expired token", () => {
    vi.stubEnv("ENCRYPTION_KEY", KEY);
    const { d, s } = signPayload("unsub", { t: 1 }, Date.now() - 2 * TOKEN_TTL_MS);
    expect(verifyPayload("unsub", d, s)).toBeNull();
  });
  it("does not verify a token signed with the nurture label", () => {
    vi.stubEnv("ENCRYPTION_KEY", KEY);
    const d = Buffer.from(JSON.stringify({ t: 1, x: Date.now() + TOKEN_TTL_MS })).toString("base64url");
    const k = createHmac("sha256", Buffer.from(KEY, "hex")).update("nurture:unsub").digest();
    const s = createHmac("sha256", k).update(d).digest("base64url");
    expect(verifyPayload("unsub", d, s)).toBeNull();
  });
  it("throws on sign without ENCRYPTION_KEY", () => {
    vi.stubEnv("ENCRYPTION_KEY", "");
    expect(() => signPayload("unsub", {})).toThrow("ENCRYPTION_KEY");
  });
});
