import { describe, it, expect, vi, afterEach } from "vitest";
import { signPayload, verifyPayload, TOKEN_TTL_MS } from "./token";

vi.mock("server-only", () => ({}));

const KEY = "ab".repeat(32);
afterEach(() => vi.unstubAllEnvs());

describe("nurture token", () => {
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
  it("a click token is not an unsub token", () => {
    vi.stubEnv("ENCRYPTION_KEY", KEY);
    const { d, s } = signPayload("click", { t: 1 });
    expect(verifyPayload("unsub", d, s)).toBeNull();
    expect(verifyPayload("click", d, s)).toMatchObject({ t: 1 });
  });
  it("does not verify an expired token", () => {
    vi.stubEnv("ENCRYPTION_KEY", KEY);
    const { d, s } = signPayload("unsub", { t: 1 }, Date.now() - 2 * TOKEN_TTL_MS);
    expect(verifyPayload("unsub", d, s)).toBeNull();
  });
  it("throws on sign without ENCRYPTION_KEY", () => {
    vi.stubEnv("ENCRYPTION_KEY", "");
    expect(() => signPayload("click", {})).toThrow("ENCRYPTION_KEY");
  });
});
