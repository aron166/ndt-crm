import { describe, it, expect, vi, beforeEach } from "vitest";

// Every secrets/email/rate-card action refuses a non-CRM caller BEFORE any DB
// access, encryption or outbound send.

const { db, encrypt, sendEmail, sendTestEmail, moveLead } = vi.hoisted(() => {
  const m = () => ({ create: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), upsert: vi.fn(), updateMany: vi.fn() });
  return {
    db: { integrationCredential: m(), appApiKey: m(), costRate: m() },
    encrypt: vi.fn(),
    sendEmail: vi.fn(),
    sendTestEmail: vi.fn(),
    moveLead: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/crypto", () => ({ encrypt }));
vi.mock("@/lib/integrations/resend", () => ({ DEFAULT_TENANT_ID: 1, sendEmail, sendTestEmail }));
vi.mock("@/lib/leads/service", () => ({ moveLead, setLeadOutcome: vi.fn() }));
vi.mock("@/lib/actor", () => {
  const getActor = vi.fn();
  return {
  getActor,
  userLeadCtx: vi.fn(),
  NOT_A_CRM_USER: "NOT_A_CRM_USER", requireCrmUser: async (t: number) => ((await getActor(t)).userId == null ? "NOT_A_CRM_USER" : null),
};
});

import { getActor, userLeadCtx } from "@/lib/actor";
import { saveIntegrationCredential, disconnectIntegration } from "@/app/actions/integrations";
import { listAppApiKeys, createAppApiKey, revokeAppApiKey } from "@/app/actions/app-keys";
import { sendResendTest, sendCrmEmail } from "@/app/actions/email";
import { getCostRates, upsertCostRate } from "@/app/actions/cost-rates";
import { updateLeadStatus } from "@/app/actions/leads";

const denied = { error: "NOT_A_CRM_USER" };

beforeEach(() => {
  vi.clearAllMocks();
  (getActor as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ userId: null, email: null });
  (userLeadCtx as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(denied);
});

describe("secrets/email/rate-card actions auth gate", () => {
  it("denies every export without a CRM user and touches nothing", async () => {
    expect(await saveIntegrationCredential("resend", { apiKey: "k" })).toEqual(denied);
    await expect(disconnectIntegration("resend")).rejects.toThrow("NOT_A_CRM_USER");
    await expect(listAppApiKeys()).rejects.toThrow("NOT_A_CRM_USER");
    expect(await createAppApiKey("app", "l")).toEqual(denied);
    expect(await revokeAppApiKey(1)).toEqual(denied);
    expect(await sendResendTest()).toEqual(denied);
    expect(await sendCrmEmail({ to: "a@b.c", subject: "s", text: "t" })).toEqual(denied);
    await expect(getCostRates()).rejects.toThrow("NOT_A_CRM_USER");
    expect(await upsertCostRate("x", "u", "1")).toEqual(denied);
    expect(await updateLeadStatus(1, "won")).toEqual(denied);

    for (const model of Object.values(db)) for (const fn of Object.values(model)) expect(fn).not.toHaveBeenCalled();
    for (const fn of [encrypt, sendEmail, sendTestEmail, moveLead]) expect(fn).not.toHaveBeenCalled();
  });
});
