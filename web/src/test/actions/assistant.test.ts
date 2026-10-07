import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { db } = vi.hoisted(() => ({
  db: {
    assistantCall: { aggregate: vi.fn(), create: vi.fn() },
    tenant: { findUnique: vi.fn() },
    user: { findFirst: vi.fn(), findMany: vi.fn() },
    contentItem: { findFirst: vi.fn() },
    contentNote: { create: vi.fn(), findMany: vi.fn() },
    assistantConversation: { findMany: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
  },
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/actor", () => ({ getActor: vi.fn(), NOT_A_CRM_USER: "NOT_A_CRM_USER" }));

import { getActor, NOT_A_CRM_USER } from "@/lib/actor";
import { addItemNote, deleteConversation, fileTicket, getConversation, openAssistant } from "@/app/actions/assistant";

const mockGetActor = getActor as unknown as ReturnType<typeof vi.fn>;
const fetchMock = vi.fn();
const itemRow = { id: 5, title: "Cím", category: "email", purpose: null, status: "draft", body: "szöveg", currentVersion: null, checks: [] };

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("ASSISTANT_API_KEY", "sk-test");
  fetchMock.mockReset().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: "Válasz" } }], usage: { prompt_tokens: 100, completion_tokens: 20 } }), { status: 200 }));
  for (const t of Object.values(db)) for (const f of Object.values(t)) (f as ReturnType<typeof vi.fn>).mockReset();
  mockGetActor.mockResolvedValue({ userId: 2, email: "a@b.hu" });
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
    const results = await Promise.all([
      openAssistant({ itemId: 5, conversationId: null }), getConversation(3), deleteConversation(3), fileTicket(draft), addItemNote({ itemId: 5, body: "x" }),
    ]);
    for (const r of results) expect(r).toEqual({ error: NOT_A_CRM_USER });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.assistantCall.create).not.toHaveBeenCalled();
    expect(db.contentNote.create).not.toHaveBeenCalled();
    expect(db.contentItem.findFirst).not.toHaveBeenCalled();
    for (const f of Object.values(db.assistantConversation)) expect(f).not.toHaveBeenCalled();
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

const own = { tenantId: 1, userId: 2, deletedAt: null };
const convRow = { id: 3, title: "Téma", updatedAt: new Date("2026-10-07T10:00:00Z"), page: "/marketing", itemId: null, messages: [] };

describe("openAssistant", () => {
  beforeEach(() => {
    db.assistantConversation.findMany.mockResolvedValue([]);
    db.assistantConversation.findFirst.mockResolvedValue(null);
    db.contentNote.findMany.mockResolvedValue([]);
  });
  it("item from another tenant gives not found", async () => {
    db.contentItem.findFirst.mockResolvedValue(null);
    expect(await openAssistant({ itemId: 5, conversationId: null })).toEqual({ error: "Nem található" });
    expect(db.contentItem.findFirst.mock.calls[0][0].where).toEqual({ id: 5, tenantId: 1 });
  });
  it("lists and loads conversations scoped by tenant, user and not deleted", async () => {
    db.assistantConversation.findMany.mockResolvedValue([convRow]);
    db.assistantConversation.findFirst.mockResolvedValue(convRow);
    const r = await openAssistant({ itemId: null, conversationId: 3 });
    expect(db.assistantConversation.findMany.mock.calls[0][0].where).toEqual(own);
    expect(db.assistantConversation.findFirst.mock.calls[0][0].where).toEqual({ ...own, id: 3 });
    expect(r).toMatchObject({
      ok: true, conversations: [{ id: 3, title: "Téma", updatedAt: "2026-10-07T10:00:00.000Z" }],
      conversation: { id: 3, messages: [] },
    });
  });
  it("a foreign conversation id gives conversation null", async () => {
    const r = await openAssistant({ itemId: null, conversationId: 99 });
    expect(r).toMatchObject({ ok: true, conversation: null });
  });
  it("rejects a bad conversationId", async () => {
    expect(await openAssistant({ itemId: null, conversationId: -1 })).toEqual({ error: "Érvénytelen kérés." });
  });
});

describe("getConversation", () => {
  it("returns an owned conversation, scoped", async () => {
    db.assistantConversation.findFirst.mockResolvedValue(convRow);
    const r = await getConversation(3);
    expect(db.assistantConversation.findFirst.mock.calls[0][0].where).toEqual({ ...own, id: 3 });
    expect(r).toMatchObject({ ok: true, conversation: { id: 3 } });
  });
  it("foreign or deleted gives Nem található", async () => {
    db.assistantConversation.findFirst.mockResolvedValue(null);
    expect(await getConversation(3)).toEqual({ error: "Nem található" });
  });
});

describe("deleteConversation", () => {
  it("soft-deletes with the owner where and logs the delete", async () => {
    db.assistantConversation.updateMany.mockResolvedValue({ count: 1 });
    expect(await deleteConversation(3)).toEqual({ ok: true });
    const a = db.assistantConversation.updateMany.mock.calls[0][0];
    expect(a.where).toEqual({ ...own, id: 3 });
    expect(a.data.deletedAt).toBeInstanceOf(Date);
    expect(db.assistantCall.create).toHaveBeenCalledTimes(1);
    expect(db.assistantCall.create.mock.calls[0][0].data).toMatchObject({ tenantId: 1, userId: 2, purpose: "conversation", action: "delete", conversationId: 3 });
  });
  it("foreign id is not found and logs nothing", async () => {
    db.assistantConversation.updateMany.mockResolvedValue({ count: 0 });
    expect(await deleteConversation(9)).toEqual({ error: "Nem található" });
    expect(db.assistantCall.create).not.toHaveBeenCalled();
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
