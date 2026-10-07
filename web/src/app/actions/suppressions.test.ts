import { describe, it, expect, vi } from "vitest";
import { db } from "@/lib/db";
import { addSuppression } from "./suppressions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/actor", () => ({ getActor: vi.fn().mockResolvedValue({ userId: 2 }), NOT_A_CRM_USER: "x" }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    suppression: { create: vi.fn().mockResolvedValue({ id: 1 }) },
    emailDraft: { findMany: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    contact: { findFirst: vi.fn() },
  },
}));

const m = db as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;

function form(target: string) {
  const f = new FormData();
  f.set("target", target);
  f.set("requestedAt", "2026-01-01");
  return f;
}

describe("addSuppression", () => {
  it("cancels a toEmail-null draft whose resolved recipient is suppressed", async () => {
    m.emailDraft.findMany.mockResolvedValue([{ id: 7, status: "draft", toEmail: null, personId: 5, companyId: 10 }]);
    m.contact.findFirst.mockResolvedValue({ email: "x@tilos.hu", person: { email: null } });
    const res = await addSuppression(form("tilos.hu"));
    expect(res).toEqual({ success: true, cancelled: 1 });
    expect(m.emailDraft.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "cancelled" } }));
  });
  it("rejects a second address outside the brackets", async () => {
    expect(await addSuppression(form("a@b.hu <c@d.hu>"))).toEqual({ error: "Érvénytelen email cím." });
  });
});
