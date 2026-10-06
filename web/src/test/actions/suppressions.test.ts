import { describe, it, expect, vi, beforeEach } from "vitest";

const { audit, db } = vi.hoisted(() => ({
  audit: vi.fn(),
  db: { suppression: { create: vi.fn() } },
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
});
