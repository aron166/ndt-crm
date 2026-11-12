import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/outreach/recipient", () => ({
  resolveDraftRecipient: vi.fn(async (_t: number, d: { toEmail: string | null }) => d.toEmail),
}));

const { db } = vi.hoisted(() => ({
  db: { emailDraft: { findMany: vi.fn(), updateMany: vi.fn() } },
}));
vi.mock("@/lib/db", () => ({ db }));

import { cancelQueuedDraftsFor } from "./cancel";

const row = (id: number, toEmail: string, status = "draft") => ({ id, status, toEmail, personId: null, companyId: 1 });

beforeEach(() => {
  vi.clearAllMocks();
  db.emailDraft.updateMany.mockResolvedValue({ count: 1 });
});

describe("cancelQueuedDraftsFor", () => {
  it("cancels only drafts to the suppressed address, status-guarded, and returns the count", async () => {
    db.emailDraft.findMany.mockResolvedValue([row(1, "x@y.hu", "approved"), row(2, "other@y.hu"), row(3, "x@y.hu", "failed")]);
    const n = await cancelQueuedDraftsFor(1, { email: "x@y.hu", domain: null });
    expect(n).toBe(2);
    expect(db.emailDraft.updateMany).toHaveBeenCalledTimes(2);
    expect(db.emailDraft.updateMany).toHaveBeenCalledWith({
      where: { id: 1, tenantId: 1, status: "approved" },
      data: { status: "cancelled" },
    });
    expect(db.emailDraft.updateMany).toHaveBeenCalledWith({
      where: { id: 3, tenantId: 1, status: "failed" },
      data: { status: "cancelled" },
    });
  });

  it("skips a row whose guarded update matched nothing", async () => {
    db.emailDraft.findMany.mockResolvedValue([row(1, "x@y.hu"), row(2, "x@y.hu")]);
    db.emailDraft.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });
    expect(await cancelQueuedDraftsFor(1, { email: "x@y.hu", domain: null })).toBe(1);
  });

  it("matches a whole domain", async () => {
    db.emailDraft.findMany.mockResolvedValue([row(1, "a@tilos.hu"), row(2, "a@else.hu")]);
    expect(await cancelQueuedDraftsFor(1, { email: null, domain: "tilos.hu" })).toBe(1);
  });

  it("cancels a draft to a plus-tagged variant of the suppressed address", async () => {
    db.emailDraft.findMany.mockResolvedValue([row(1, "name+x@gmail.com")]);
    expect(await cancelQueuedDraftsFor(1, { email: "name@gmail.com", domain: null })).toBe(1);
  });
});
