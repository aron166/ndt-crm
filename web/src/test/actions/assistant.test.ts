import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { db } = vi.hoisted(() => ({
  db: {
    assistantCall: { aggregate: vi.fn(), create: vi.fn() },
    tenant: { findUnique: vi.fn() },
    user: { findFirst: vi.fn(), findMany: vi.fn() },
    contentItem: { findFirst: vi.fn() },
    contentNote: { create: vi.fn(), findMany: vi.fn() },
  },
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/actor", () => ({ getActor: vi.fn(), NOT_A_CRM_USER: "NOT_A_CRM_USER" }));

import { getActor, NOT_A_CRM_USER } from "@/lib/actor";
import { CAP_EXCEEDED } from "@/lib/assistant/cap";
import { addItemNote, askAssistant, draftTicket, fileTicket, openAssistant } from "@/app/actions/assistant";

const mockGetActor = getActor as unknown as ReturnType<typeof vi.fn>;
const fetchMock = vi.fn();
const msg = (n: number) => Array.from({ length: n }, (_, i) => ({ role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant", content: "x" }));
const input = { pathname: "/marketing/5", itemId: 5, messages: [{ role: "user" as const, content: "Mi ez?" }] };
const usage = (tokens: number) => db.assistantCall.aggregate.mockResolvedValue({ _count: { _all: 1 }, _sum: { promptTokens: tokens, completionTokens: 0, costUsd: 0 } });
const itemRow = { id: 5, title: "Cím", category: "email", purpose: null, status: "draft", body: "szöveg", currentVersion: null, checks: [] };

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("ASSISTANT_API_KEY", "sk-test");
  fetchMock.mockReset().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: "Válasz" } }], usage: { prompt_tokens: 100, completion_tokens: 20 } }), { status: 200 }));
  for (const t of Object.values(db)) for (const f of Object.values(t)) (f as ReturnType<typeof vi.fn>).mockReset();
  mockGetActor.mockResolvedValue({ userId: 2, email: "a@b.hu" });
  usage(10);
  db.tenant.findUnique.mockResolvedValue({ settings: { contentReviewers: [2] } });
  db.user.findFirst.mockResolvedValue({ role: "admin", name: "Péter" });
  db.user.findMany.mockResolvedValue([{ id: 2 }]);
  db.contentItem.findFirst.mockResolvedValue(itemRow);
  db.assistantCall.create.mockResolvedValue({});
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("guard", () => {
  it("every export is denied without a CRM user and touches nothing", async () => {
    mockGetActor.mockResolvedValue({ userId: null, email: null });
    const draft = { title: "Hibás gomb", body: "Nem működik a gomb.", label: "bug" as const, repo: "ndt-crm" as const };
    const results = await Promise.all([openAssistant({ itemId: 5 }), askAssistant(input), draftTicket(input), fileTicket(draft), addItemNote({ itemId: 5, body: "x" })]);
    for (const r of results) expect(r).toEqual({ error: NOT_A_CRM_USER });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.assistantCall.create).not.toHaveBeenCalled();
    expect(db.contentNote.create).not.toHaveBeenCalled();
    expect(db.contentItem.findFirst).not.toHaveBeenCalled();
  });
});

describe("askAssistant", () => {
  it("replies and logs one assistantCall", async () => {
    expect(await askAssistant(input)).toEqual({ ok: true, reply: "Válasz" });
    expect(db.assistantCall.create).toHaveBeenCalledTimes(1);
    expect(db.assistantCall.create.mock.calls[0][0].data).toMatchObject({
      tenantId: 1, userId: 2, page: "/marketing/5", purpose: "explain", itemId: 5, model: "grok-4.3", promptTokens: 100, completionTokens: 20,
    });
    expect(db.contentItem.findFirst.mock.calls[0][0].where).toEqual({ id: 5, tenantId: 1 });
  });
  it("returns CAP_EXCEEDED and does not call the model", async () => {
    usage(2_000_000);
    expect(await askAssistant(input)).toEqual({ error: CAP_EXCEEDED });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.assistantCall.create).not.toHaveBeenCalled();
  });
  it("rejects 21 user messages", async () => {
    const messages = Array.from({ length: 21 }, (_, i) => ({ role: "user" as const, content: "x" + i }));
    const r = await askAssistant({ ...input, messages });
    expect(r).toEqual({ error: "Ebben a beszélgetésben elérte a 20 üzenetet. Kérem, kezdjen újat." });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rejects bad pathname, last assistant message, empty list", async () => {
    expect("error" in (await askAssistant({ ...input, pathname: "/companies" }))).toBe(true);
    expect("error" in (await askAssistant({ ...input, messages: msg(2) }))).toBe(true);
    expect("error" in (await askAssistant({ ...input, messages: [] }))).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rejects an item from another tenant", async () => {
    db.contentItem.findFirst.mockResolvedValue(null);
    expect(await askAssistant(input)).toEqual({ error: "Nem található" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("accepts an assistant message of 3000 chars", async () => {
    const messages = [{ role: "user" as const, content: "Mi ez?" }, { role: "assistant" as const, content: "y".repeat(3000) }, { role: "user" as const, content: "És ez?" }];
    expect(await askAssistant({ ...input, messages })).toEqual({ ok: true, reply: "Válasz" });
  });
  it("2xx with empty content but usage still logs the call and returns an error", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: "" } }], usage: { prompt_tokens: 50, completion_tokens: 7 } }), { status: 200 }));
    expect("error" in (await askAssistant(input))).toBe(true);
    expect(db.assistantCall.create).toHaveBeenCalledTimes(1);
    expect(db.assistantCall.create.mock.calls[0][0].data).toMatchObject({ promptTokens: 50, completionTokens: 7 });
  });
  it("not configured without a key", async () => {
    vi.stubEnv("ASSISTANT_API_KEY", "");
    expect(await askAssistant(input)).toEqual({ error: "Az asszisztens nincs beállítva." });
  });
  it("provider failure gives a generic error and logs nothing", async () => {
    fetchMock.mockResolvedValue(new Response("boom sk-test", { status: 500 }));
    const r = await askAssistant(input);
    expect(JSON.stringify(r)).not.toContain("sk-test");
    expect("error" in r).toBe(true);
    expect(db.assistantCall.create).not.toHaveBeenCalled();
  });
});

describe("draftTicket", () => {
  it("returns a parsed draft in json mode and logs purpose ticket", async () => {
    const d = { title: "Hibás gomb", body: "Nem működik a gomb az oldalon.", label: "bug", repo: "ndt-crm" };
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(d) } }] }), { status: 200 }));
    expect(await draftTicket(input)).toEqual({ ok: true, draft: d });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ response_format: { type: "json_object" }, max_tokens: 700 });
    expect(db.assistantCall.create.mock.calls[0][0].data.purpose).toBe("ticket");
  });
  it("unparseable output asks to rephrase", async () => {
    expect("error" in (await draftTicket(input))).toBe(true);
  });
});

describe("fileTicket", () => {
  const draft = { title: "Hibás gomb", body: "Nem működik a gomb.", label: "bug" as const, repo: "ndt-crm" as const };
  it("files via the issues token, appends the footer and returns the url", async () => {
    vi.stubEnv("ASSISTANT_GITHUB_TOKEN", "ghp-test");
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ html_url: "https://github.com/aron166/ndt-crm/issues/9" }), { status: 201 }));
    expect(await fileTicket(draft)).toEqual({ ok: true, url: "https://github.com/aron166/ndt-crm/issues/9" });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body).body as string;
    expect(body).toContain("Beküldve a CRM asszisztensből, beküldő: Péter");
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer ghp-test");
  });
  it("without ASSISTANT_GITHUB_TOKEN returns the fallback url", async () => {
    vi.stubEnv("ASSISTANT_GITHUB_TOKEN", "");
    const r = await fileTicket(draft);
    expect(r).toHaveProperty("fallbackUrl");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rejects a tampered draft", async () => {
    expect(await fileTicket({ title: "x", body: "y", label: "bug", repo: "evil" } as never)).toEqual({ error: "Érvénytelen kérés." });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("openAssistant", () => {
  it("item from another tenant gives not found", async () => {
    db.contentItem.findFirst.mockResolvedValue(null);
    expect(await openAssistant({ itemId: 5 })).toEqual({ error: "Nem található" });
    expect(db.contentItem.findFirst.mock.calls[0][0].where).toEqual({ id: 5, tenantId: 1 });
  });
});

describe("addItemNote", () => {
  it("looks the item up tenant-scoped and returns a view", async () => {
    db.contentItem.findFirst.mockResolvedValue({ id: 5 });
    db.contentNote.create.mockResolvedValue({ id: 9, body: "jegyzet", createdAt: new Date("2026-10-07T10:00:00Z"), user: { name: "Péter" } });
    const r = await addItemNote({ itemId: 5, body: "  jegyzet " });
    expect(r).toEqual({ ok: true, note: { id: 9, body: "jegyzet", author: "Péter", createdAt: "2026-10-07T10:00:00.000Z" } });
    expect(db.contentItem.findFirst.mock.calls[0][0].where).toEqual({ id: 5, tenantId: 1 });
    expect(db.contentNote.create.mock.calls[0][0].data).toEqual({ tenantId: 1, itemId: 5, userId: 2, body: "jegyzet" });
  });
  it("rejects empty, too long, and foreign items", async () => {
    expect("error" in (await addItemNote({ itemId: 5, body: "   " }))).toBe(true);
    expect("error" in (await addItemNote({ itemId: 5, body: "x".repeat(4001) }))).toBe(true);
    db.contentItem.findFirst.mockResolvedValue(null);
    expect(await addItemNote({ itemId: 6, body: "x" })).toEqual({ error: "Nem található" });
    expect(db.contentNote.create).not.toHaveBeenCalled();
  });
});
