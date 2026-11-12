import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac, randomBytes } from "node:crypto";

const m = vi.hoisted(() => ({
  draftFind: vi.fn(), draftUpdate: vi.fn(),
  evCreate: vi.fn(), evFind: vi.fn(), evUpdate: vi.fn(),
  campFind: vi.fn(), memberFind: vi.fn(), ceFind: vi.fn(), ceCreate: vi.fn(),
  optOut: vi.fn(), report: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: {
    emailDraft: { findFirst: m.draftFind, update: m.draftUpdate },
    emailProviderEvent: { create: m.evCreate, findUnique: m.evFind, update: m.evUpdate },
    campaign: { findFirst: m.campFind },
    campaignMember: { findFirst: m.memberFind },
    campaignEvent: { findFirst: m.ceFind, create: m.ceCreate },
  },
}));
vi.mock("@/lib/outreach/unsubscribe", () => ({ applyOptOut: m.optOut }));
vi.mock("@/lib/report-error", () => ({ reportError: m.report }));

import { verifyResendSignature, processResendEvent } from "./resend-webhook";

const secretBytes = randomBytes(32);
const secret = "whsec_" + secretBytes.toString("base64");
const sign = (id: string, ts: string, body: string, key = secretBytes) =>
  "v1," + createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64");

describe("verifyResendSignature", () => {
  const now = 1_800_000_000;
  const body = '{"type":"email.sent","data":{}}';
  const h = (over: Partial<{ id: string | null; timestamp: string | null; signature: string | null }> = {}) => ({
    id: "msg_1", timestamp: String(now), signature: sign("msg_1", String(now), body), ...over,
  });

  it("accepts a correct signature", () => expect(verifyResendSignature(body, h(), secret, now)).toBe(true));
  it("accepts when only the second of two signatures matches", () => {
    expect(verifyResendSignature(body, h({ signature: `v1,AAAA ${sign("msg_1", String(now), body)}` }), secret, now)).toBe(true);
  });
  it("rejects a tampered body", () => expect(verifyResendSignature(body + " ", h(), secret, now)).toBe(false));
  it("rejects a wrong secret", () => {
    expect(verifyResendSignature(body, h(), "whsec_" + randomBytes(32).toString("base64"), now)).toBe(false);
  });
  it("timestamp 301 s old fails, 299 s passes", () => {
    const old = (s: number) => String(now - s);
    expect(verifyResendSignature(body, h({ timestamp: old(301), signature: sign("msg_1", old(301), body) }), secret, now)).toBe(false);
    expect(verifyResendSignature(body, h({ timestamp: old(299), signature: sign("msg_1", old(299), body) }), secret, now)).toBe(true);
  });
  it("rejects a missing header", () => {
    expect(verifyResendSignature(body, h({ id: null }), secret, now)).toBe(false);
    expect(verifyResendSignature(body, h({ timestamp: null }), secret, now)).toBe(false);
    expect(verifyResendSignature(body, h({ signature: null }), secret, now)).toBe(false);
  });
  it("rejects v2 only, a non-numeric timestamp and a bad secret without throwing", () => {
    expect(verifyResendSignature(body, h({ signature: sign("msg_1", String(now), body).replace("v1,", "v2,") }), secret, now)).toBe(false);
    expect(verifyResendSignature(body, h({ timestamp: "abc" }), secret, now)).toBe(false);
    expect(verifyResendSignature(body, h(), "not-a-secret", now)).toBe(false);
    expect(verifyResendSignature(body, h(), "", now)).toBe(false);
  });
});

const evt = (type: string, data: Record<string, unknown> = {}) => ({
  type,
  created_at: "2026-02-22T23:41:12.126Z",
  data: { email_id: "56761188-7520-42d8-8898-ff6fc54ce618", to: ["Delivered@Resend.dev"], ...data },
});
const bounced = (t: string) => evt("email.bounced", { bounce: { message: "x", subType: "Suppressed", type: t } });
const draft = { id: 7, companyId: 3, campaign: "c1", step: 1 };
const p2002 = Object.assign(new Error("dup"), { code: "P2002" });
const now = new Date("2026-11-12T10:00:00Z");

describe("processResendEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.draftFind.mockResolvedValue(draft);
    m.evCreate.mockResolvedValue({ id: 1, processedAt: null });
    m.campFind.mockResolvedValue({ id: 11 });
    m.memberFind.mockResolvedValue({ id: 21 });
    m.ceFind.mockResolvedValue(null);
    m.optOut.mockResolvedValue({ suppressed: true, memberUpdated: true });
  });

  it("Permanent bounce -> opt-out kind bounce, lastError, row processed", async () => {
    expect(await processResendEvent(1, "msg_a", bounced("Permanent"), now)).toEqual({ duplicate: false, type: "email.bounced" });
    expect(m.optOut).toHaveBeenCalledWith(1, "delivered@resend.dev", { kind: "bounce", source: "resend_bounce", draftId: 7, agent: "resend" });
    expect(m.draftUpdate).toHaveBeenCalledWith({ where: { id: 7 }, data: { lastError: "Visszapattant (Suppressed)" } });
    expect(m.evUpdate).toHaveBeenCalledWith({ where: { id: 1 }, data: { processedAt: now } });
  });
  it("Temporary bounce -> stored only", async () => {
    await processResendEvent(1, "msg_a", bounced("Temporary"), now);
    expect(m.evCreate).toHaveBeenCalled();
    expect(m.optOut).not.toHaveBeenCalled();
    expect(m.evUpdate).toHaveBeenCalled();
  });
  it("complained -> opt-out kind complaint", async () => {
    await processResendEvent(1, "msg_a", evt("email.complained"), now);
    expect(m.optOut).toHaveBeenCalledWith(1, "delivered@resend.dev", { kind: "complaint", source: "resend_complaint", draftId: 7, agent: "resend" });
  });
  it("suppressed -> bounce path", async () => {
    await processResendEvent(1, "msg_a", evt("email.suppressed"), now);
    expect(m.optOut).toHaveBeenCalledWith(1, "delivered@resend.dev", expect.objectContaining({ kind: "bounce", source: "resend_bounce" }));
  });
  it("delivered with draft and member -> one campaign event", async () => {
    await processResendEvent(1, "msg_a", evt("email.delivered"), now);
    expect(m.ceCreate).toHaveBeenCalledWith({
      data: { tenantId: 1, campaignId: 11, memberId: 21, stepPosition: 1, outcome: "email_delivered", actorAgentId: "resend", at: new Date("2026-02-22T23:41:12.126Z") },
    });
  });
  it("a second open of the same member and step adds none", async () => {
    m.ceFind.mockResolvedValue({ id: 99 });
    await processResendEvent(1, "msg_b", evt("email.opened"), now);
    expect(m.ceCreate).not.toHaveBeenCalled();
  });
  it("delivered without a draft -> stored only", async () => {
    m.draftFind.mockResolvedValue(null);
    await processResendEvent(1, "msg_a", evt("email.delivered"), now);
    expect(m.ceCreate).not.toHaveBeenCalled();
    expect(m.evUpdate).toHaveBeenCalled();
  });
  it("unknown type -> stored, no effects", async () => {
    expect(await processResendEvent(1, "msg_a", evt("email.something_new"), now)).toEqual({ duplicate: false, type: "email.something_new" });
    expect(m.evCreate).toHaveBeenCalled();
    expect(m.optOut).not.toHaveBeenCalled();
    expect(m.ceCreate).not.toHaveBeenCalled();
  });
  it("P2002 with processedAt set -> duplicate, no effects", async () => {
    m.evCreate.mockRejectedValue(p2002);
    m.evFind.mockResolvedValue({ id: 1, processedAt: now });
    expect(await processResendEvent(1, "msg_a", bounced("Permanent"), now)).toEqual({ duplicate: true, type: "email.bounced" });
    expect(m.optOut).not.toHaveBeenCalled();
    expect(m.evUpdate).not.toHaveBeenCalled();
  });
  it("P2002 with processedAt null -> effects run", async () => {
    m.evCreate.mockRejectedValue(p2002);
    m.evFind.mockResolvedValue({ id: 1, processedAt: null });
    expect(await processResendEvent(1, "msg_a", bounced("Permanent"), now)).toEqual({ duplicate: false, type: "email.bounced" });
    expect(m.optOut).toHaveBeenCalled();
    expect(m.evUpdate).toHaveBeenCalledWith({ where: { id: 1 }, data: { processedAt: now } });
  });
  it("other create errors propagate", async () => {
    m.evCreate.mockRejectedValue(new Error("boom"));
    await expect(processResendEvent(1, "msg_a", bounced("Permanent"), now)).rejects.toThrow("boom");
  });
  it("data.to missing on a complaint -> stored, reported, nothing suppressed", async () => {
    await processResendEvent(1, "msg_a", { type: "email.complained", data: { email_id: "x" } }, now);
    expect(m.optOut).not.toHaveBeenCalled();
    expect(m.report).toHaveBeenCalled();
    expect(m.evUpdate).toHaveBeenCalled();
  });
  it("data not an object -> type kept, stored", async () => {
    expect(await processResendEvent(1, "msg_a", { type: "email.bounced", data: "oops" }, now)).toEqual({ duplicate: false, type: "email.bounced" });
    expect(m.draftFind).not.toHaveBeenCalled();
    expect(m.optOut).not.toHaveBeenCalled();
  });
  it("non-object event -> type unknown", async () => {
    expect(await processResendEvent(1, "msg_a", null, now)).toEqual({ duplicate: false, type: "unknown" });
  });
  it("stores the e-mail lowercased", async () => {
    await processResendEvent(1, "msg_a", evt("email.sent"), now);
    expect(m.evCreate.mock.calls[0][0].data).toMatchObject({ email: "delivered@resend.dev", provider: "resend", eventId: "msg_a", draftId: 7 });
  });
});
