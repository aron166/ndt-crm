import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { validateAppKey, rateLimit } from "@/lib/app-key-auth";
import { logLeadCallOutcome } from "@/lib/leads/service";
import { AssistantError, assistantConfig, chatCompletion } from "@/lib/assistant/provider";
import { capState } from "@/lib/assistant/cap";
import { POST } from "./route";

vi.mock("@/lib/app-key-auth", () => ({ validateAppKey: vi.fn(), rateLimit: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    interaction: { findFirst: vi.fn() },
    lead: { findFirst: vi.fn(), findMany: vi.fn() },
    assistantCall: { create: vi.fn() },
  },
}));
vi.mock("@/lib/leads/service", () => ({ logLeadCallOutcome: vi.fn() }));
vi.mock("@/lib/assistant/provider", async () => ({
  ...(await vi.importActual<typeof import("@/lib/assistant/provider")>("@/lib/assistant/provider")),
  assistantConfig: vi.fn(),
  chatCompletion: vi.fn(),
}));
vi.mock("@/lib/assistant/cap", () => ({ capState: vi.fn() }));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));

const m = db as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;
const mock = <T>(f: T) => f as unknown as ReturnType<typeof vi.fn>;

const MODEL_JSON = JSON.stringify({
  company: "Teszt Kft.", person: null, outcome: "callback_requested", callback_at: "2026-10-13T10:00",
  next_step: "Visszahívás kedden", objections: [], technology_word: "georadar", lost_reason: null,
  note: "Érdeklődik, kedden 10-kor visszahívjuk.",
});

function req(body: unknown, raw = false) {
  return new Request("http://x/api/assistant/callnote", { method: "POST", body: raw ? (body as string) : JSON.stringify(body) });
}
const T = "Hívtam a Teszt Kft.-t, kedden tíz órakor kérnek visszahívást, georadar érdekli őket.";

beforeEach(() => {
  vi.clearAllMocks();
  mock(validateAppKey).mockResolvedValue({ keyId: 9, tenantId: 7, appSlug: "callnotes" });
  mock(rateLimit).mockReturnValue(true);
  mock(assistantConfig).mockReturnValue({ model: "m" });
  mock(capState).mockResolvedValue({ exceeded: false });
  mock(chatCompletion).mockResolvedValue({ text: MODEL_JSON, promptTokens: 10, completionTokens: 5 });
  m.interaction.findFirst.mockResolvedValue(null);
  m.lead.findFirst.mockResolvedValue({ id: 3 });
  m.lead.findMany.mockResolvedValue([]);
  m.assistantCall.create.mockResolvedValue({});
  mock(logLeadCallOutcome).mockResolvedValue({ interactionId: 11, taskId: 12 });
});

describe("POST /api/assistant/callnote", () => {
  it("403 for a non-allow-listed app slug, before body parsing", async () => {
    mock(validateAppKey).mockResolvedValue({ keyId: 9, tenantId: 7, appSlug: "other" });
    expect((await POST(req("{nope", true))).status).toBe(403);
    expect(chatCompletion).not.toHaveBeenCalled();
  });
  it("400 on a 12001 char transcript", async () => {
    expect((await POST(req({ transcript: "x".repeat(12_001) }))).status).toBe(400);
  });
  it("same transcript for two lead_ids gets different callIds and both apply", async () => {
    const a = await POST(req({ transcript: T, lead_id: 3, apply: true }));
    const b = await POST(req({ transcript: T, lead_id: 4, apply: true }));
    expect([a.status, b.status]).toEqual([201, 201]);
    const ids = mock(logLeadCallOutcome).mock.calls.map((c) => (c[1] as { callId: string }).callId);
    expect(ids[0]).not.toBe(ids[1]);
    expect(m.interaction.findFirst.mock.calls[0][0].where.callId).toBe(ids[0]);
  });
  it("P2002 race replays as 200 existed", async () => {
    m.lead.findMany.mockResolvedValue([{ id: 3, company: { name: "Teszt Kft." } }]);
    mock(logLeadCallOutcome).mockRejectedValue(Object.assign(new Error("dup"), { code: "P2002" }));
    m.interaction.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 77, leadId: 3 });
    const res = await POST(req({ transcript: T, apply: true }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, applied: true, existed: true, interaction_id: 77, lead_id: 3 });
  });
  it("401 without a key", async () => {
    mock(validateAppKey).mockResolvedValue(null);
    expect((await POST(req({ transcript: T }))).status).toBe(401);
  });
  it("400 on invalid JSON", async () => {
    expect((await POST(req("{nope", true))).status).toBe(400);
  });
  it("400 on empty body and blank transcript", async () => {
    expect((await POST(req({}))).status).toBe(400);
    expect((await POST(req({ transcript: "   " }))).status).toBe(400);
  });
  it("503 when not configured", async () => {
    mock(assistantConfig).mockReturnValue(null);
    expect((await POST(req({ transcript: T }))).status).toBe(503);
    expect(chatCompletion).not.toHaveBeenCalled();
  });
  it("replay with apply returns existed without a model call", async () => {
    m.interaction.findFirst.mockResolvedValue({ id: 50, leadId: 3 });
    const res = await POST(req({ transcript: T, apply: true }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ existed: true, interaction_id: 50, lead_id: 3 });
    expect(chatCompletion).not.toHaveBeenCalled();
  });
  it("404 for a lead_id outside the tenant, before any model call", async () => {
    m.lead.findFirst.mockResolvedValue(null);
    expect((await POST(req({ transcript: T, lead_id: 99 }))).status).toBe(404);
    expect(m.lead.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 99, tenantId: 7 } }));
    expect(chatCompletion).not.toHaveBeenCalled();
  });
  it("422 with issues when the model JSON fails validation", async () => {
    mock(chatCompletion).mockResolvedValue({ text: JSON.stringify({ company: "X", outcome: "bogus", note: "n" }), promptTokens: 1, completionTokens: 1 });
    const res = await POST(req({ transcript: T }));
    expect(res.status).toBe(422);
    expect((await res.json()).issues).toBeDefined();
  });
  it("429 when the provider rate limits", async () => {
    mock(chatCompletion).mockRejectedValue(new AssistantError("slow", 429));
    expect((await POST(req({ transcript: T }))).status).toBe(429);
  });
  it("502 on any other provider error", async () => {
    mock(chatCompletion).mockRejectedValue(new AssistantError("boom", 500));
    expect((await POST(req({ transcript: T }))).status).toBe(502);
  });
  it("exact single match gives a proposal, not applied", async () => {
    m.lead.findMany.mockResolvedValue([{ id: 3, company: { name: "Teszt Kft." } }]);
    const res = await POST(req({ transcript: T }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, applied: false, lead_id: 3 });
    expect(body.payload.callId).toMatch(/^callnote:/);
    expect(logLeadCallOutcome).not.toHaveBeenCalled();
  });
  it("422 with contains candidates on zero exact matches", async () => {
    m.lead.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 4, company: { name: "Teszt Kft. Zrt." } }]);
    const res = await POST(req({ transcript: T }));
    expect(res.status).toBe(422);
    expect((await res.json()).candidates).toEqual([{ lead_id: 4, company: "Teszt Kft. Zrt." }]);
    expect(m.lead.findMany.mock.calls[1][0].where.company.name).toHaveProperty("contains", "Teszt Kft.");
  });
  it("422 on two exact matches", async () => {
    const two = [{ id: 3, company: { name: "Teszt Kft." } }, { id: 4, company: { name: "Teszt Kft." } }];
    m.lead.findMany.mockResolvedValue(two);
    const res = await POST(req({ transcript: T }));
    expect(res.status).toBe(422);
    expect((await res.json()).candidates).toHaveLength(2);
  });
  it("apply happy path logs the outcome with the key's tenant", async () => {
    m.lead.findMany.mockResolvedValue([{ id: 3, company: { name: "Teszt Kft." } }]);
    const res = await POST(req({ transcript: T, apply: true }));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ applied: true, lead_id: 3, interaction_id: 11, task_id: 12 });
    expect(logLeadCallOutcome).toHaveBeenCalledWith(
      3, expect.objectContaining({ technologyWord: "georadar", outcome: "callback_requested" }), expect.objectContaining({ tenantId: 7 }),
    );
    expect(m.assistantCall.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ purpose: "callnote", userId: null, tenantId: 7 }),
    });
  });
});
