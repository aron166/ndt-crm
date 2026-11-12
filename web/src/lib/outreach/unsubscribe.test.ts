import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { db } from "@/lib/db";
import { recordOutcome } from "@/lib/campaigns/service";
import { verifyPayload } from "./token";
import { unsubscribeUrl, unsubscribeHeaders, applyOptOut } from "./unsubscribe";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/campaigns/service", () => ({ recordOutcome: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    suppression: { findFirst: vi.fn(), create: vi.fn() },
    emailDraft: { findFirst: vi.fn(), updateMany: vi.fn() },
    campaign: { findFirst: vi.fn() },
    campaignMember: { findFirst: vi.fn() },
  },
}));

const m = db as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;
const rec = recordOutcome as unknown as ReturnType<typeof vi.fn>;
const KEY = "ab".repeat(32);
const draft = { id: 9, companyId: 4, campaign: "bp" };
const opts = { kind: "unsubscribe" as const, source: "unsubscribe_link", draftId: 9, agent: "unsubscribe" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ENCRYPTION_KEY", KEY);
  m.suppression.findFirst.mockResolvedValue(null);
  m.suppression.create.mockResolvedValue({});
  m.emailDraft.findFirst.mockResolvedValue(draft);
  m.emailDraft.updateMany.mockResolvedValue({ count: 2 });
  m.campaign.findFirst.mockResolvedValue({ id: 3 });
  m.campaignMember.findFirst.mockResolvedValue({ id: 7, state: "queued" });
  rec.mockResolvedValue({ ok: true });
});
afterEach(() => vi.unstubAllEnvs());

describe("unsubscribeHeaders", () => {
  it("gives both headers and a verifying URL", () => {
    const h = unsubscribeHeaders(2, " A@B.hu ", 5);
    expect(h["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    const url = h["List-Unsubscribe"].slice(1, -1);
    expect(h["List-Unsubscribe"]).toMatch(/^<.*>$/);
    const u = new URL(url);
    expect(u.pathname).toBe("/api/outreach/unsubscribe");
    expect(verifyPayload("unsub", u.searchParams.get("d"), u.searchParams.get("s"))).toMatchObject({ t: 2, e: "a@b.hu", r: 5 });
    expect(unsubscribeUrl(2, "a@b.hu", 5).startsWith("https://")).toBe(true);
  });
  it("throws without ENCRYPTION_KEY", () => {
    vi.stubEnv("ENCRYPTION_KEY", "");
    expect(() => unsubscribeHeaders(1, "a@b.hu", 1)).toThrow("ENCRYPTION_KEY");
  });
});

describe("applyOptOut", () => {
  it("creates one suppression, cancels the rest and records the outcome", async () => {
    const r = await applyOptOut(1, "A@B.hu", opts);
    expect(r).toEqual({ suppressed: true, memberUpdated: true });
    expect(m.suppression.create).toHaveBeenCalledTimes(1);
    expect(m.suppression.create.mock.calls[0][0].data).toMatchObject({ tenantId: 1, email: "a@b.hu", channel: "email", source: "unsubscribe_link", note: "unsubscribe" });
    expect(m.emailDraft.findFirst.mock.calls[0][0].where).toEqual({ id: 9, tenantId: 1 });
    expect(m.emailDraft.updateMany).toHaveBeenCalledWith({
      where: { tenantId: 1, companyId: 4, campaign: "bp", status: { in: ["draft", "approved", "failed"] } },
      data: { status: "cancelled" },
    });
    expect(rec).toHaveBeenCalledWith({ tenantId: 1, userId: null, appSlug: "unsubscribe" }, "bp", { member_id: 7, outcome: "unsubscribe", email: "a@b.hu" });
  });
  it("is idempotent: no second suppression row", async () => {
    m.suppression.findFirst.mockResolvedValue({ id: 1 });
    await applyOptOut(1, "a@b.hu", opts);
    expect(m.suppression.create).not.toHaveBeenCalled();
  });
  it("treats a P2002 race as success", async () => {
    m.suppression.create.mockRejectedValue({ code: "P2002" });
    await expect(applyOptOut(1, "a@b.hu", opts)).resolves.toMatchObject({ suppressed: true });
  });
  it("rethrows other suppression errors", async () => {
    m.suppression.create.mockRejectedValue(new Error("db down"));
    await expect(applyOptOut(1, "a@b.hu", opts)).rejects.toThrow("db down");
  });
  it("records bounce for kind bounce", async () => {
    await applyOptOut(1, "a@b.hu", { ...opts, kind: "bounce" });
    expect(rec.mock.calls[0][2].outcome).toBe("bounce");
  });
  it("without draftId finds the newest sent or replied draft by address", async () => {
    await applyOptOut(1, "a@b.hu", { ...opts, draftId: null });
    expect(m.emailDraft.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 1, status: { in: ["sent", "replied"] }, toEmail: { equals: "a@b.hu", mode: "insensitive" } },
      orderBy: { sentAt: "desc" },
    }));
  });
  it("closed member: no recordOutcome, memberUpdated false", async () => {
    m.campaignMember.findFirst.mockResolvedValue({ id: 7, state: "declined" });
    expect(await applyOptOut(1, "a@b.hu", opts)).toEqual({ suppressed: true, memberUpdated: false });
    expect(rec).not.toHaveBeenCalled();
  });
  it("recordOutcome error is reported, not thrown", async () => {
    rec.mockResolvedValue({ error: "Nem futó kampány", status: 409 });
    expect(await applyOptOut(1, "a@b.hu", opts)).toEqual({ suppressed: true, memberUpdated: false });
  });
  it("no draft: memberUpdated false", async () => {
    m.emailDraft.findFirst.mockResolvedValue(null);
    expect(await applyOptOut(1, "a@b.hu", opts)).toEqual({ suppressed: true, memberUpdated: false });
    expect(m.emailDraft.updateMany).not.toHaveBeenCalled();
  });
  it("empty or whitespace email throws and writes nothing", async () => {
    await expect(applyOptOut(1, "  ", opts)).rejects.toThrow();
    expect(m.suppression.create).not.toHaveBeenCalled();
  });
  it("writes the tenant it was given only", async () => {
    await applyOptOut(2, "a@b.hu", opts);
    expect(m.suppression.create.mock.calls[0][0].data.tenantId).toBe(2);
    expect(m.emailDraft.updateMany.mock.calls[0][0].where.tenantId).toBe(2);
  });
});
