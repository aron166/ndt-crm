import { describe, it, expect, vi, beforeEach } from "vitest";

const { audit, db } = vi.hoisted(() => ({
  audit: vi.fn(),
  db: { suppression: { create: vi.fn() }, emailDraft: { findMany: vi.fn(), updateMany: vi.fn() } },
}));

vi.mock("@/lib/audit", () => ({ audit }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/actor", () => ({ getActor: vi.fn(), NOT_A_CRM_USER: "NOT_A_CRM_USER" }));

import { getActor, NOT_A_CRM_USER } from "@/lib/actor";
import { addSuppression } from "@/app/actions/suppressions";

const mockGetActor = getActor as unknown as ReturnType<typeof vi.fn>;

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.append(k, v);
  return f;
}

beforeEach(() => {
  audit.mockReset();
  db.suppression.create.mockReset();
  db.suppression.create.mockResolvedValue({ id: 9 });
  db.emailDraft.findMany.mockReset().mockResolvedValue([]);
  db.emailDraft.updateMany.mockReset().mockResolvedValue({ count: 1 });
  mockGetActor.mockResolvedValue({ userId: 2, email: "aron@example.com" });
});

describe("addSuppression", () => {
  it("is denied without a CRM user and writes nothing", async () => {
    mockGetActor.mockResolvedValue({ userId: null, email: null });
    const res = await addSuppression(fd({ target: "a@b.hu", requestedAt: "2026-01-01" }));
    expect(res).toEqual({ error: NOT_A_CRM_USER });
    expect(db.suppression.create).not.toHaveBeenCalled();
  });

  it("stores an address lowercased as email with domain null", async () => {
    await addSuppression(fd({ target: " Kiss.Pista@Ceg.HU ", requestedAt: "2026-01-01" }));
    const data = db.suppression.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ tenantId: 1, email: "kiss.pista@ceg.hu", domain: null, createdById: 2 });
    expect(audit).toHaveBeenCalled();
  });

  it("stores @Ceg.hu as domain ceg.hu", async () => {
    await addSuppression(fd({ target: "@Ceg.hu", requestedAt: "2026-01-01" }));
    expect(db.suppression.create.mock.calls[0][0].data).toMatchObject({ email: null, domain: "ceg.hu" });
  });

  it("rejects garbage", async () => {
    const res = await addSuppression(fd({ target: "nem cim", requestedAt: "2026-01-01" }));
    expect(res).toHaveProperty("error");
    expect(db.suppression.create).not.toHaveBeenCalled();
  });

  it("stores the normalised form of a pasted address", async () => {
    await addSuppression(fd({ target: "<A@Ceg.hu>", requestedAt: "2026-01-01" }));
    expect(db.suppression.create.mock.calls[0][0].data).toMatchObject({ email: "a@ceg.hu", domain: null });
  });

  it("cancels queued drafts matching an address entry and reports the count", async () => {
    db.emailDraft.findMany.mockResolvedValue([
      { id: 1, status: "draft", toEmail: "A@ceg.hu" },
      { id: 2, status: "approved", toEmail: "other@ceg.hu" },
    ]);
    const res = await addSuppression(fd({ target: "a@ceg.hu", requestedAt: "2026-01-01" }));
    expect(res).toEqual({ success: true, cancelled: 1 });
    expect(db.emailDraft.updateMany).toHaveBeenCalledTimes(1);
    expect(db.emailDraft.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: 1 }, data: { status: "cancelled" } });
    expect(audit).toHaveBeenCalledWith("email_draft", 1, "update", { status: "draft" }, expect.objectContaining({ status: "cancelled" }));
  });

  it("a domain entry cancels subdomain drafts but not lookalikes", async () => {
    db.emailDraft.findMany.mockResolvedValue([
      { id: 1, status: "draft", toEmail: "x@iroda.ceg.hu" },
      { id: 2, status: "failed", toEmail: "x@nemceg.hu" },
    ]);
    const res = await addSuppression(fd({ target: "@ceg.hu", requestedAt: "2026-01-01" }));
    expect(res).toEqual({ success: true, cancelled: 1 });
  });
});
