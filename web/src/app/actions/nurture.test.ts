import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { userLeadCtx } from "@/lib/actor";
import { approveNurtureTemplateAction } from "./nurture";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/actor", () => ({ userLeadCtx: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    tenant: { findUnique: vi.fn() },
    nurtureTemplate: { findFirst: vi.fn(), updateMany: vi.fn() },
  },
}));

const d = vi.mocked(db, true);
const ctx = vi.mocked(userLeadCtx);

beforeEach(() => {
  vi.clearAllMocks();
  d.tenant.findUnique.mockResolvedValue({ settings: { demoHosts: { aron: 1, peter: 2 } } } as never);
  d.nurtureTemplate.findFirst.mockResolvedValue({ status: "proposal", approvedByAron: false } as never);
  d.nurtureTemplate.updateMany.mockResolvedValue({ count: 1 } as never);
});

describe("approveNurtureTemplateAction", () => {
  it("rejects a non-Aron user and updates nothing", async () => {
    ctx.mockResolvedValue({ tenantId: 1, userId: 2 } as never);
    const r = await approveNurtureTemplateAction(5, true);
    expect(r).toHaveProperty("error");
    expect(d.nurtureTemplate.updateMany).not.toHaveBeenCalled();
  });

  it("Aron approves and can revoke", async () => {
    ctx.mockResolvedValue({ tenantId: 1, userId: 1 } as never);
    expect(await approveNurtureTemplateAction(5, true)).toEqual({ success: true });
    expect(d.nurtureTemplate.updateMany.mock.calls[0][0].data).toMatchObject({ status: "approved", approvedByAron: true });
    expect(await approveNurtureTemplateAction(5, false)).toEqual({ success: true });
    expect(d.nurtureTemplate.updateMany.mock.calls[1][0].data).toMatchObject({ status: "proposal", approvedByAron: false, approvedAt: null });
  });
});
