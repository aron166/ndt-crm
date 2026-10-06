import { describe, it, expect, vi, beforeEach } from "vitest";

// Every automations action refuses a caller that is not a CRM user, BEFORE any
// DB read or write. createAutomation unauthenticated was an anonymous
// "POST every new lead to my URL" primitive via webhook_out.

const { db } = vi.hoisted(() => ({
  db: {
    automationRule: { create: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
    user: { findFirst: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/leads/queries", () => ({ getLeadStatuses: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/actor", () => ({ getActor: vi.fn(), NOT_A_CRM_USER: "NOT_A_CRM_USER" }));

import { getActor } from "@/lib/actor";
import { createAutomation, updateAutomation, toggleAutomation, deleteAutomation } from "@/app/actions/automations";

const mockGetActor = getActor as unknown as ReturnType<typeof vi.fn>;

function webhookRule(): FormData {
  const f = new FormData();
  f.set("name", "x");
  f.set("triggerType", "lead_created");
  f.set("actionType", "webhook_out");
  f.set("actionConfig", JSON.stringify({ url: "https://evil.example/hook" }));
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetActor.mockResolvedValue({ userId: null, email: null });
});

describe("automations actions auth gate", () => {
  it("denies all four exports without a CRM user and touches no rule", async () => {
    expect(await createAutomation(webhookRule())).toEqual({ error: "NOT_A_CRM_USER" });
    expect(await updateAutomation(1, webhookRule())).toEqual({ error: "NOT_A_CRM_USER" });
    expect(await toggleAutomation(1, false)).toEqual({ error: "NOT_A_CRM_USER" });
    expect(await deleteAutomation(1)).toEqual({ error: "NOT_A_CRM_USER" });
    for (const fn of Object.values(db.automationRule)) expect(fn).not.toHaveBeenCalled();
  });

  it("lets a CRM user through to the write", async () => {
    mockGetActor.mockResolvedValue({ userId: 2, email: "a@example.com" });
    db.automationRule.create.mockResolvedValue({ id: 9 });
    expect(await createAutomation(webhookRule())).toEqual({ success: true });
    expect(db.automationRule.create).toHaveBeenCalledTimes(1);
  });
});
