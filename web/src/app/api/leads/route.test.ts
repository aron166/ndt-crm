import { describe, it, expect, vi, beforeEach } from "vitest";

const ingest = vi.fn();
vi.mock("@/lib/app-key-auth", () => ({ validateAppKey: vi.fn(async () => ({ keyId: 1, tenantId: 1, appSlug: "betonscan_landing" })), rateLimit: vi.fn(() => true) }));
vi.mock("@/lib/db", () => ({ db: { $transaction: async (f: (tx: unknown) => unknown) => f({}), lead: { findFirst: vi.fn() } } }));
vi.mock("@/lib/leads/ingest", () => ({ ingestLead: (...a: unknown[]) => ingest(...a), appThreadKey: (a: string, k: string) => `app~${a}~${k}` }));
const side = { life: vi.fn(), alert: vi.fn(), ping: vi.fn(), reply: vi.fn(), intro: vi.fn(), auto: vi.fn() };
vi.mock("@/lib/leads/lifecycle-sweep", () => ({ startLeadLifecycle: (...a: unknown[]) => side.life(...a) }));
vi.mock("@/lib/leads/form-alert", () => ({ sendFormAlert: (...a: unknown[]) => side.alert(...a) }));
vi.mock("@/lib/leads/intake-notify", () => ({ sendAutoReply: (...a: unknown[]) => side.reply(...a), sendLeadPing: (...a: unknown[]) => side.ping(...a) }));
vi.mock("@/lib/leads/intro", () => ({ sendIntroMaterial: (...a: unknown[]) => side.intro(...a) }));
vi.mock("@/lib/automations/engine", () => ({ runAutomations: (...a: unknown[]) => side.auto(...a) }));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));

import { POST, OPTIONS } from "./route";

const body = { company_name: "Minta Kft.", contact_email: "a@minta.hu", send_intro: true };
const post = (b: unknown, h: Record<string, string> = {}) =>
  POST(new Request("http://x/api/leads", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer k", ...h }, body: JSON.stringify(b) }));

beforeEach(() => { ingest.mockReset(); Object.values(side).forEach((f) => f.mockReset()); });

describe("POST /api/leads Idempotency-Key", () => {
  it("the header reaches ingest as idempotency_key; CORS allows the header", async () => {
    ingest.mockResolvedValue({ leadId: 5, deduped: false, companyId: 1, personId: 2, tier: null });
    expect((await post(body, { "Idempotency-Key": "Key-1" })).status).toBe(201);
    expect(ingest.mock.calls[0][0]).toMatchObject({ idempotency_key: "key-1" });
    expect((await OPTIONS()).headers.get("Access-Control-Allow-Headers")).toContain("Idempotency-Key");
  });
  it("the body field works alone; header and body that disagree are refused before any write", async () => {
    ingest.mockResolvedValue({ leadId: 5, deduped: false, companyId: 1, personId: 2, tier: null });
    await post({ ...body, idempotency_key: "k2" });
    expect(ingest.mock.calls[0][0]).toMatchObject({ idempotency_key: "k2" });
    ingest.mockClear();
    const r = await post({ ...body, idempotency_key: "a" }, { "Idempotency-Key": "b" });
    expect(r.status).toBe(400);
    expect(ingest).not.toHaveBeenCalled();
  });
  it("a repeat returns the first result and fires no intro, alert, auto-reply or automation", async () => {
    ingest.mockResolvedValue({ leadId: 5, deduped: true, companyId: 1 });
    const r = await post(body, { "Idempotency-Key": "k3" });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, leadId: 5, deduped: true });
    for (const [n, f] of Object.entries(side)) expect(f, n).not.toHaveBeenCalled();
  });
  it("no key: unchanged, a normal create", async () => {
    ingest.mockResolvedValue({ leadId: 6, deduped: false, companyId: 1, personId: 2, tier: null });
    expect((await post(body)).status).toBe(201);
    expect(ingest.mock.calls[0][0].idempotency_key).toBeUndefined();
  });
});
