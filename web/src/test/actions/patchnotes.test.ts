import { describe, it, expect, vi, beforeEach } from "vitest";

const { db } = vi.hoisted(() => ({ db: { patchTestMark: { upsert: vi.fn(), deleteMany: vi.fn() } } }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/actor", () => ({ getActor: vi.fn(), NOT_A_CRM_USER: "NOT_A_CRM_USER" }));

import { getActor, NOT_A_CRM_USER } from "@/lib/actor";
import { setPatchStepState } from "@/app/actions/patchnotes";

const mockGetActor = getActor as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  db.patchTestMark.upsert.mockReset().mockResolvedValue({});
  db.patchTestMark.deleteMany.mockReset().mockResolvedValue({ count: 1 });
  mockGetActor.mockResolvedValue({ userId: 2, email: "a@b.hu" });
});

describe("setPatchStepState", () => {
  it("is denied without a CRM user and writes nothing", async () => {
    mockGetActor.mockResolvedValue({ userId: null, email: null });
    expect(await setPatchStepState("ndt-crm", 1, 0, "ok")).toEqual({ error: NOT_A_CRM_USER });
    expect(db.patchTestMark.upsert).not.toHaveBeenCalled();
    expect(db.patchTestMark.deleteMany).not.toHaveBeenCalled();
  });

  it("upserts keyed by tenant 1 and the actor's userId", async () => {
    expect(await setPatchStepState("ndt-crm", 5, 3, "bug")).toEqual({ ok: true });
    const arg = db.patchTestMark.upsert.mock.calls[0][0];
    expect(arg.where.tenantId_userId_repo_prNumber_stepIndex).toEqual({ tenantId: 1, userId: 2, repo: "ndt-crm", prNumber: 5, stepIndex: 3 });
    expect(arg.create).toMatchObject({ tenantId: 1, userId: 2, state: "bug" });
  });

  it("null state deletes scoped to tenant and user", async () => {
    await setPatchStepState("growth", 5, 0, null);
    expect(db.patchTestMark.deleteMany.mock.calls[0][0].where).toMatchObject({ tenantId: 1, userId: 2, repo: "growth" });
    expect(db.patchTestMark.upsert).not.toHaveBeenCalled();
  });

  it.each([
    ["unknown repo", "nope", 1, 0, "ok"],
    ["fractional pr", "ndt-crm", 1.5, 0, "ok"],
    ["negative pr", "ndt-crm", -1, 0, "ok"],
    ["stepIndex 100", "ndt-crm", 1, 100, "ok"],
    ["bad state", "ndt-crm", 1, 0, "maybe"],
  ])("rejects %s", async (_n, repo, pr, step, state) => {
    const res = await setPatchStepState(repo, pr, step, state as never);
    expect(res).toHaveProperty("error");
    expect(db.patchTestMark.upsert).not.toHaveBeenCalled();
    expect(db.patchTestMark.deleteMany).not.toHaveBeenCalled();
  });
});
