import { describe, it, expect, vi, beforeEach } from "vitest";

const ingest = vi.fn();
vi.mock("@/lib/app-key-auth", () => ({ validateAppKey: vi.fn(async () => ({ keyId: 1, tenantId: 1, appSlug: "betonscan_landing" })), rateLimit: vi.fn(() => true) }));
const dbm = vi.hoisted(() => ({ $transaction: async (f: (tx: unknown) => unknown) => f({}), $executeRaw: vi.fn(), lead: { findFirst: vi.fn() } }));
vi.mock("@/lib/db", () => ({ db: dbm }));
vi.mock("@/lib/leads/ingest", () => ({ ingestLead: (...a: unknown[]) => ingest(...a), appThreadKey: (a: string, k: string) => `app~${a}~${k}` }));
const side = { life: vi.fn(), alert: vi.fn(), ping: vi.fn(), reply: vi.fn(), intro: vi.fn(), auto: vi.fn() };
vi.mock("@/lib/leads/lifecycle-sweep", () => ({ startLeadLifecycle: (...a: unknown[]) => side.life(...a) }));
vi.mock("@/lib/leads/form-alert", () => ({ sendFormAlert: (...a: unknown[]) => side.alert(...a) }));
vi.mock("@/lib/leads/intake-notify", () => ({ sendAutoReply: (...a: unknown[]) => side.reply(...a), sendLeadPing: (...a: unknown[]) => side.ping(...a) }));
vi.mock("@/lib/leads/intro", () => ({ sendIntroMaterial: (...a: unknown[]) => side.intro(...a) }));
vi.mock("@/lib/automations/engine", () => ({ runAutomations: (...a: unknown[]) => side.auto(...a) }));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));

import { Prisma } from "@prisma/client";
import { POST, OPTIONS } from "./route";

const body = { company_name: "Minta Kft.", contact_email: "a@minta.hu", send_intro: true };
const post = (b: unknown, h: Record<string, string> = {}) =>
  POST(new Request("http://x/api/leads", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer k", ...h }, body: JSON.stringify(b) }));

beforeEach(() => { ingest.mockReset(); dbm.$executeRaw.mockReset(); dbm.lead.findFirst.mockReset(); Object.values(side).forEach((f) => f.mockReset()); });

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

const dup = (ageSec: number, effectsDone = false) => ({
  leadId: 5, deduped: true, companyId: 1, personId: 2, viaIdempotencyKey: true,
  leadCreatedAt: new Date(Date.now() - ageSec * 1000), effectsDone,
});
const fired = () => Object.entries(side).filter(([, f]) => f.mock.calls.length > 0).map(([n]) => n).sort();
const ALL = ["alert", "auto", "intro", "life", "ping", "reply"];

describe("Idempotency-Key: post-commit effects are recoverable", () => {
  it("(a) a repeat within 60 s fires nothing and writes no marker (the first request is still running them)", async () => {
    ingest.mockResolvedValue(dup(5));
    const r = await post(body, { "Idempotency-Key": "k" });
    expect(r.status).toBe(200);
    expect(fired()).toEqual([]);
    expect(dbm.$executeRaw).not.toHaveBeenCalled();
  });
  it("(b) a repeat after 60 s on an unmarked lead fires each effect exactly once and sets the marker", async () => {
    ingest.mockResolvedValue(dup(120));
    const r = await post({ ...body, channel: "landing" }, { "Idempotency-Key": "k" });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ deduped: true, leadId: 5, effectsRecovered: true });
    expect(fired()).toEqual(ALL);
    for (const f of Object.values(side)) expect(f).toHaveBeenCalledTimes(1);
    expect(dbm.$executeRaw).toHaveBeenCalledTimes(1);
    expect(dbm.$executeRaw.mock.calls[0][0].join("?")).toContain("effects_done_at");
    expect(dbm.$executeRaw.mock.calls[0].slice(1)).toContain(5);
  });
  it("(c) a repeat on a marked lead fires nothing, however old", async () => {
    ingest.mockResolvedValue(dup(9999, true));
    expect((await post(body, { "Idempotency-Key": "k" })).status).toBe(200);
    expect(fired()).toEqual([]);
    expect(dbm.$executeRaw).not.toHaveBeenCalled();
  });
  it("(d) no key: effects fire as before and no marker is written; with a key, a first post fires then marks", async () => {
    ingest.mockResolvedValue({ leadId: 6, deduped: false, companyId: 1, personId: 2, tier: null });
    expect((await post({ ...body, channel: "landing" })).status).toBe(201);
    expect(fired()).toEqual(ALL);
    expect(dbm.$executeRaw).not.toHaveBeenCalled();
    Object.values(side).forEach((f) => f.mockReset());
    expect((await post({ ...body, channel: "landing" }, { "Idempotency-Key": "k" })).status).toBe(201);
    expect(fired()).toEqual(ALL);
    expect(dbm.$executeRaw).toHaveBeenCalledTimes(1);
  });
  it("a thread_key dedupe (no idempotency key) never recovers anything", async () => {
    ingest.mockResolvedValue({ leadId: 5, deduped: true, companyId: 1 });
    await post(body);
    expect(fired()).toEqual([]);
  });
});

describe("Idempotency-Key: unique-index race (simulated at the route; the index itself is the existing thread_key one, not run on Postgres here)", () => {
  it("the loser of a race re-reads the winner by the namespaced key and answers deduped", async () => {
    ingest.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x", meta: { target: ["tenant_id", "thread_key"] } }));
    dbm.lead.findFirst.mockResolvedValue({ id: 77, companyId: 3 });
    const r = await post(body, { "Idempotency-Key": "K" });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, leadId: 77, deduped: true });
    expect(dbm.lead.findFirst.mock.calls[0][0].where).toMatchObject({ tenantId: 1, threadKey: { in: ["app~betonscan_landing~idem~k"] } });
    expect(fired()).toEqual([]);
  });
});
