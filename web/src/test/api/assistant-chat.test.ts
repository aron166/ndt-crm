import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { db } = vi.hoisted(() => ({
  db: {
    user: { findFirst: vi.fn() },
    assistantConversation: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    assistantCall: { create: vi.fn() },
    contentItem: { findMany: vi.fn() },
    contentCheck: { findMany: vi.fn() },
  },
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/actor", () => ({ getActor: vi.fn(), NOT_A_CRM_USER: "NOT_A_CRM_USER" }));
vi.mock("@/lib/content/reviewers", () => ({ getContentReviewers: vi.fn() }));
vi.mock("@/lib/assistant/cap", () => ({ capState: vi.fn(), CAP_EXCEEDED: "cap" }));
vi.mock("@/lib/assistant/hub-context", () => ({ loadHubData: vi.fn(), renderHubContext: vi.fn(() => "HUB"), routeIntent: vi.fn(() => ({ kind: "general" })) }));
vi.mock("@/lib/assistant/context", async () => ({
  ...(await vi.importActual<typeof import("@/lib/assistant/context")>("@/lib/assistant/context")),
  loadItemContext: vi.fn(),
}));

import { getActor } from "@/lib/actor";
import { getContentReviewers } from "@/lib/content/reviewers";
import { capState } from "@/lib/assistant/cap";
import { loadHubData } from "@/lib/assistant/hub-context";
import { loadItemContext } from "@/lib/assistant/context";
import { RATE_LIMITED } from "@/lib/assistant/provider";
import { POST } from "@/app/api/assistant/chat/route";

const mock = <T>(f: T) => f as unknown as ReturnType<typeof vi.fn>;
const fetchMock = vi.fn();
const enc = new TextEncoder();

const sse = (content: string) => new Response(new ReadableStream({
  start(c) {
    // Split into small pieces so several deltas are produced.
    for (let i = 0; i < content.length; i += 15) c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: content.slice(i, i + 15) } }] })}\n\n`));
    c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [], x_groq: { usage: { prompt_tokens: 100, completion_tokens: 20 } } })}\n\ndata: [DONE]\n\n`));
    c.close();
  },
}), { status: 200 });
const reply = (answer: string, actions: unknown[] = [], read: number[] = []) => JSON.stringify({ read_item_ids: read, answer, actions });
const flat = (o: Record<string, unknown>) => ({
  type: "note", item_id: null, check_id: null, verdict: null, reason: null, comment: null, path: null, text: null, title: null,
  context: null, options: null, recommendation: null, deadline: null, decided_by: null, label: null, ...o,
});

const req = (body: unknown) => new Request("http://x/api/assistant/chat", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) });
const ok = { conversationId: null, pathname: "/marketing/5", itemId: 5, message: "Mi ez?" };
type Ev = { type: string; [k: string]: unknown };
const events = async (res: Response): Promise<Ev[]> =>
  (await res.text()).split("\n\n").filter(Boolean).map((b) => JSON.parse(b.split("\ndata: ")[1]));
const calls = () => db.assistantCall.create.mock.calls.map((c) => c[0].data);

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("ASSISTANT_API_KEY", "sk-test");
  fetchMock.mockReset().mockImplementation(async () => sse(reply("Ez egy hírlevél.")));
  for (const t of Object.values(db)) for (const f of Object.values(t)) (f as ReturnType<typeof vi.fn>).mockReset();
  mock(getActor).mockResolvedValue({ userId: 2, email: "a@b.hu" });
  mock(getContentReviewers).mockResolvedValue([2]);
  mock(capState).mockResolvedValue({ used: 0, cap: 100, exceeded: false });
  mock(loadHubData).mockResolvedValue({});
  mock(loadItemContext).mockReset().mockResolvedValue({ id: 5, title: "Hírlevél", category: "email", purpose: null, status: "draft", body: "szöveg", checks: [] });
  db.user.findFirst.mockResolvedValue({ name: "Péter", role: "admin", settings: {} });
  db.assistantConversation.create.mockResolvedValue({ id: 7, page: "/marketing/5", itemId: 5, messages: [] });
  db.assistantConversation.updateMany.mockResolvedValue({ count: 1 });
  // Persist re-reads the stored turns; default: an empty conversation.
  db.assistantConversation.findFirst.mockResolvedValue({ id: 7, page: "/marketing/5", itemId: 5, messages: [], updatedAt: new Date("2026-10-07T10:00:00Z") });
  db.assistantCall.create.mockResolvedValue({});
  db.contentItem.findMany.mockResolvedValue([]);
  db.contentCheck.findMany.mockResolvedValue([]);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("denial paths", () => {
  const noModel = () => { expect(fetchMock).not.toHaveBeenCalled(); expect(db.assistantCall.create).not.toHaveBeenCalled(); };
  it("no CRM user is 403", async () => {
    mock(getActor).mockResolvedValue({ userId: null, email: null });
    expect((await POST(req(ok))).status).toBe(403);
    noModel();
    expect(db.assistantConversation.create).not.toHaveBeenCalled();
  });
  it("malformed JSON is 400", async () => {
    expect((await POST(req("{nope"))).status).toBe(400);
    noModel();
  });
  it("pathname outside /marketing is 400", async () => {
    expect((await POST(req({ ...ok, pathname: "/companies" }))).status).toBe(400);
    noModel();
  });
  it("message over 2000 chars is 400", async () => {
    expect((await POST(req({ ...ok, message: "x".repeat(2001) }))).status).toBe(400);
    noModel();
  });
  it("foreign or deleted conversationId is 404 and no model call", async () => {
    db.assistantConversation.findFirst.mockResolvedValue(null);
    expect((await POST(req({ ...ok, conversationId: 3 }))).status).toBe(404);
    expect(db.assistantConversation.findFirst.mock.calls[0][0].where).toEqual({ id: 3, tenantId: 1, userId: 2, deletedAt: null });
    noModel();
  });
  it("no ASSISTANT_API_KEY is 503", async () => {
    vi.stubEnv("ASSISTANT_API_KEY", "");
    expect((await POST(req(ok))).status).toBe(503);
    noModel();
  });
  it("cap exceeded is 429", async () => {
    mock(capState).mockResolvedValue({ used: 100, cap: 100, exceeded: true });
    expect((await POST(req(ok))).status).toBe(429);
    noModel();
  });
  it("20 user turns is 400", async () => {
    const messages = Array.from({ length: 20 }, (_, i) => ({ role: "user", content: `u${i}`, at: "t" }));
    db.assistantConversation.findFirst.mockResolvedValue({ id: 3, page: "/marketing", itemId: null, messages });
    expect((await POST(req({ ...ok, conversationId: 3 }))).status).toBe(400);
    noModel();
  });
});

describe("happy path", () => {
  it("streams start, deltas, done; creates, persists and logs", async () => {
    const message = "k".repeat(100);
    const seen = new Date("2026-10-07T10:00:00Z");
    // The persist step re-reads the stored turns (a card may have been stamped meanwhile).
    db.assistantConversation.findFirst.mockResolvedValue({ messages: [{ role: "assistant", content: "régi", at: "x", actions: [{ key: "k1", summary: "s", proposal: { type: "waiting" }, executedAt: "2026-10-07T09:59:00Z" }] }], updatedAt: seen });
    const res = await POST(req({ ...ok, message }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");
    const ev = await events(res);
    expect(ev[0]).toEqual({ type: "start", conversationId: 7 });
    const deltas = ev.filter((e) => e.type === "delta");
    expect(deltas.length).toBeGreaterThan(0);
    expect(ev.map((e) => e.type)).toEqual(["start", ...deltas.map(() => "delta"), "done"]);
    const done = ev[ev.length - 1];
    expect(deltas.map((d) => d.text).join("")).toBe(done.answer);
    expect(done).toMatchObject({ answer: "Ez egy hírlevél.", actions: [] });

    expect(db.assistantConversation.create.mock.calls[0][0].data).toMatchObject({ tenantId: 1, userId: 2, title: "k".repeat(80), page: "/marketing/5", itemId: 5 });
    const upd = db.assistantConversation.updateMany.mock.calls[0][0];
    expect(upd.where).toEqual({ id: 7, tenantId: 1, userId: 2, deletedAt: null, updatedAt: seen });
    expect(upd.data.messages).toMatchObject([
      { role: "assistant", content: "régi", actions: [{ key: "k1", executedAt: "2026-10-07T09:59:00Z" }] },
      { role: "user", content: message }, { role: "assistant", content: "Ez egy hírlevél.", actions: [] },
    ]);
    expect(calls()).toHaveLength(2);
    expect(calls()[0]).toMatchObject({ purpose: "conversation", action: "create", conversationId: 7, tenantId: 1, userId: 2 });
    expect(calls()[1]).toMatchObject({ purpose: "chat", conversationId: 7, promptTokens: 100, completionTokens: 20 });
  });
  it("reuses an existing conversation without creating or logging a create", async () => {
    db.assistantConversation.findFirst.mockResolvedValue({ id: 3, page: "/marketing/5", itemId: 5, messages: [] });
    const ev = await events(await POST(req({ ...ok, conversationId: 3 })));
    expect(ev[0]).toEqual({ type: "start", conversationId: 3 });
    expect(db.assistantConversation.create).not.toHaveBeenCalled();
    expect(calls().map((c) => c.purpose)).toEqual(["chat"]);
  });
  it("drops an invalid action (navigate to an external url) from done.actions", async () => {
    fetchMock.mockImplementation(async () => sse(reply("Itt a link.", [flat({ type: "navigate", path: "https://evil" })])));
    const ev = await events(await POST(req(ok)));
    expect(ev[ev.length - 1]).toMatchObject({ type: "done", actions: [] });
  });
  it("keeps a valid enriched action", async () => {
    db.contentItem.findMany.mockResolvedValue([{ id: 5, title: "Hírlevél", currentVersionId: 11 }]);
    fetchMock.mockImplementation(async () => sse(reply("Jóváhagyom?", [flat({ type: "review", item_id: 5, verdict: "approve" })])));
    const ev = await events(await POST(req(ok)));
    const done = ev[ev.length - 1] as unknown as { actions: { key: string; proposal: { versionId: number } }[] };
    expect(done.actions).toHaveLength(1);
    expect(done.actions[0].proposal.versionId).toBe(11);
    // Keys are unique per conversation (stamp prefix), not the bare index that repeats every turn.
    expect(done.actions[0].key).toMatch(/^[0-9a-z]+-0-review$/);
  });
});

describe("read hop", () => {
  it("stops the first call, loads the item, answers on the second", async () => {
    mock(loadItemContext).mockImplementation(async (_t: number, id: number) =>
      id === 5 ? { id: 5, title: "Hírlevél", category: "email", purpose: null, status: "draft", body: "TITKOS-SZÖVEG", checks: [] } : null);
    fetchMock
      .mockImplementationOnce(async () => sse(reply("", [], [5]) ))
      .mockImplementationOnce(async () => sse(reply("A szöveg rendben van.")));
    const ev = await events(await POST(req({ ...ok, itemId: null, pathname: "/marketing" })));
    const types = ev.map((e) => e.type);
    expect(types[0]).toBe("start");
    expect(types[1]).toBe("status");
    expect(ev[1].text).toBe("Megnyitom: #5");
    expect(types[types.length - 1]).toBe("done");
    expect(loadItemContext).toHaveBeenCalledWith(1, 5);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(calls().map((c) => c.purpose)).toEqual(["conversation", "read", "chat"]);
    const second = JSON.parse(fetchMock.mock.calls[1][1].body).messages as { content: string }[];
    expect(second.some((m) => m.content.includes("<item>") && m.content.includes("TITKOS-SZÖVEG"))).toBe(true);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).messages.some((m: { content: string }) => m.content.includes("TITKOS-SZÖVEG"))).toBe(false);
  });
});

describe("failures", () => {
  it("an unparseable stream falls back to one strict call; both bad gives an error and persists nothing", async () => {
    fetchMock.mockImplementationOnce(async () => sse("ez nem json"))
      .mockImplementationOnce(async () => Response.json({ choices: [{ message: { content: "ez sem json" } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }));
    const ev = await events(await POST(req(ok)));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).response_format.type).toBe("json_schema");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).response_format).toBeUndefined();
    expect(ev[ev.length - 1].type).toBe("error");
    expect(ev.some((e) => e.type === "done")).toBe(false);
    // Nothing persisted; the empty new conversation is soft-deleted instead.
    const calls = (db.assistantConversation.updateMany as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.every((c) => !("messages" in c[0].data))).toBe(true);
    expect(calls.some((c) => "deletedAt" in c[0].data)).toBe(true);
  });
  it("strict fallback answer resets the streamed text and finishes", async () => {
    fetchMock.mockImplementationOnce(async () => sse('{"read_item_ids":[],"answer":"Rossz'))
      .mockImplementationOnce(async () => Response.json({ choices: [{ message: { content: JSON.stringify({ read_item_ids: [], answer: "Jó válasz.", actions: [] }) } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }));
    const ev = await events(await POST(req(ok)));
    expect(ev.some((e) => e.type === "reset")).toBe(true);
    const afterReset = ev.slice(ev.findIndex((e) => e.type === "reset") + 1).filter((e) => e.type === "delta").map((e) => (e as unknown as { text: string }).text).join("");
    expect(afterReset).toBe("Jó válasz.");
    expect(ev[ev.length - 1]).toMatchObject({ type: "done", answer: "Jó válasz." });
  });
  it("provider 429 twice gives the rate-limit copy", async () => {
    const sleepless = () => new Response("{}", { status: 429, headers: { "retry-after": "0" } });
    fetchMock.mockImplementation(async () => sleepless());
    const ev = await events(await POST(req(ok)));
    expect(ev[ev.length - 1]).toEqual({ type: "error", message: RATE_LIMITED });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const calls = (db.assistantConversation.updateMany as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.every((c) => !("messages" in c[0].data))).toBe(true);
  });
  it("persist losing the updatedAt race 3 times gives an error, no done, and drops the new conversation", async () => {
    db.assistantConversation.updateMany.mockResolvedValue({ count: 0 });
    const ev = await events(await POST(req(ok)));
    expect(ev.some((e) => e.type === "done")).toBe(false);
    expect(ev[ev.length - 1].type).toBe("error");
    const calls = (db.assistantConversation.updateMany as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.filter((c) => "messages" in c[0].data)).toHaveLength(3);
    expect(calls.some((c) => "deletedAt" in c[0].data)).toBe(true);
  });
  it("a one-burst answer (Groq gpt-oss) is re-emitted word by word", async () => {
    const answer = "Kettő anyag van a Vázlat szakaszban, mindkettő régi.";
    const burst = new Response(new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { content: reply(answer) } }] })}\n\ndata: [DONE]\n\n`));
        c.close();
      },
    }), { status: 200 });
    fetchMock.mockImplementation(async () => burst);
    const ev = await events(await POST(req(ok)));
    const deltas = ev.filter((e) => e.type === "delta").map((e) => (e as unknown as { text: string }).text);
    expect(deltas.length).toBeGreaterThan(5);
    expect(deltas.join("")).toBe(answer);
    expect(ev[ev.length - 1]).toMatchObject({ type: "done", answer });
  });
  it("no delta follows an error while a burst is pacing", async () => {
    const answer = "Egy kettő három négy öt hat hét nyolc kilenc tíz tizenegy tizenkettő.";
    fetchMock.mockImplementation(async () => new Response(new ReadableStream({
      start(c) { c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { content: reply(answer) } }] })}\n\ndata: [DONE]\n\n`)); c.close(); },
    }), { status: 200 }));
    db.assistantConversation.updateMany.mockResolvedValue({ count: 0 });
    const ev = await events(await POST(req(ok)));
    const errAt = ev.findIndex((e) => e.type === "error");
    expect(errAt).toBeGreaterThan(-1);
    expect(ev.slice(errAt + 1).some((e) => e.type === "delta")).toBe(false);
  });
});
