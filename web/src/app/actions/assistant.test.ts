import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { getActor } from "@/lib/actor";
import { getContentReviewers } from "@/lib/content/reviewers";
import { addChecks, createItem } from "@/lib/content/service";
import { submitContentReview, setContentCheck } from "@/app/actions/content";
import { loadPageData } from "@/lib/assistant/page-context";
import {
  openAssistant, getConversation, deleteConversation, fileTicket, addItemNote, whatsWaiting, executeAction,
} from "./assistant";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/actor", () => ({ getActor: vi.fn(), NOT_A_CRM_USER: "NOT_A_CRM_USER_MSG" }));
vi.mock("@/lib/db", () => ({
  db: {
    user: { findFirst: vi.fn() },
    contentItem: { findFirst: vi.fn() },
    contentVersion: { findFirst: vi.fn() },
    contentNote: { findMany: vi.fn(), create: vi.fn() },
    contentCheck: { findFirst: vi.fn(), create: vi.fn() },
    assistantCall: { create: vi.fn() },
    assistantConversation: { findMany: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/content/reviewers", () => ({ getContentReviewers: vi.fn() }));
vi.mock("@/lib/content/service", async () => ({
  ...(await vi.importActual<typeof import("@/lib/content/service")>("@/lib/content/service")),
  createItem: vi.fn(),
  addChecks: vi.fn(),
}));
vi.mock("@/app/actions/content", () => ({ submitContentReview: vi.fn(), setContentCheck: vi.fn() }));
vi.mock("@/lib/assistant/ticket", async () => ({
  ...(await vi.importActual<typeof import("@/lib/assistant/ticket")>("@/lib/assistant/ticket")),
  createGithubIssue: vi.fn(async () => ({ ok: true, url: "https://gh/1" })),
}));
vi.mock("@/lib/assistant/page-context", () => ({ loadPageData: vi.fn(), renderPageContext: vi.fn() }));
vi.mock("@/lib/assistant/cap", () => ({ capState: vi.fn(), CAP_EXCEEDED: "cap" }));
vi.mock("@/lib/assistant/context", async () => ({
  ...(await vi.importActual<typeof import("@/lib/assistant/context")>("@/lib/assistant/context")),
  loadItemContext: vi.fn(),
}));

const mock = <T>(f: T) => f as unknown as ReturnType<typeof vi.fn>;
type Dbm = Record<string, Record<string, ReturnType<typeof vi.fn>>>;
const m = db as unknown as Dbm;

const draft = { title: "Hiba van", body: "Részletes leírás a hibáról", label: "bug" as const, repo: "ndt-crm" as const };

beforeEach(() => {
  vi.clearAllMocks();
  mock(getActor).mockResolvedValue({ userId: 5, email: "a@b.hu" });
});

describe("denial for a non CRM user", () => {
  it("every action returns NOT_A_CRM_USER and writes nothing", async () => {
    mock(getActor).mockResolvedValue({ userId: null, email: null });
    const results = await Promise.all([
      openAssistant({ itemId: null, conversationId: null }),
      getConversation(1),
      deleteConversation(1),
      fileTicket(draft),
      addItemNote({ itemId: 1, body: "x" }),
      whatsWaiting(),
      executeAction({ type: "note", itemId: 1, body: "x" }),
    ]);
    for (const r of results) expect(r).toEqual({ error: "NOT_A_CRM_USER_MSG" });
    for (const t of Object.values(m)) if (typeof t === "object") for (const f of Object.values(t)) expect(f).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(createItem).not.toHaveBeenCalled();
    expect(submitContentReview).not.toHaveBeenCalled();
  });
});

describe("executeAction as a CRM user", () => {
  it("rejects a none proposal", async () => {
    const r = await executeAction({ type: "none", message: "x" });
    expect("error" in r).toBe(true);
  });
  it("create_decision by a non-reviewer is refused", async () => {
    mock(getContentReviewers).mockResolvedValue([]);
    const r = await executeAction({ type: "create_decision", question: "Mehet?", context: "c", options: ["a"], decidedBy: "either" });
    expect(r).toEqual({ error: "Csak bíráló hozhat létre döntést." });
    expect(createItem).not.toHaveBeenCalled();
  });
  it("review on another tenant's version is Nem található", async () => {
    m.contentVersion.findFirst.mockResolvedValue(null);
    const r = await executeAction({ type: "review", itemId: 9, versionId: 4, verdict: "approve" });
    expect(r).toEqual({ error: "Nem található" });
    expect(m.contentVersion.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 4, itemId: 9, tenantId: 1 } }));
    expect(submitContentReview).not.toHaveBeenCalled();
  });
  it("review without versionId is refused", async () => {
    expect(await executeAction({ type: "review", itemId: 9, verdict: "approve" })).toEqual({ error: "Érvénytelen kérés." });
    expect(submitContentReview).not.toHaveBeenCalled();
  });
  it("review passes the proposal's versionId, not currentVersionId, and surfaces the 409 text", async () => {
    m.contentVersion.findFirst.mockResolvedValue({ id: 4 });
    m.contentItem.findFirst.mockResolvedValue({ currentVersionId: 8 });
    mock(submitContentReview).mockResolvedValue({ ok: false, error: "Newer version exists" });
    const r = await executeAction({ type: "review", itemId: 9, versionId: 4, verdict: "approve" });
    expect(r).toEqual({ error: "Newer version exists" });
    expect(submitContentReview).toHaveBeenCalledWith(expect.objectContaining({ versionId: 4 }));
    expect(m.assistantCall.create).not.toHaveBeenCalled();
  });
  it("answer_decision, note and ticket each log an execute call with the action type", async () => {
    m.assistantCall.create.mockResolvedValue({});
    m.contentCheck.findFirst.mockResolvedValue({ itemId: 3 });
    mock(setContentCheck).mockResolvedValue({ ok: true });
    m.contentItem.findFirst.mockResolvedValue({ id: 3 });
    m.contentNote.create.mockResolvedValue({ id: 1, body: "b", createdAt: new Date(), user: null });
    expect("ok" in (await executeAction({ type: "answer_decision", checkId: 2, answer: "igen" }))).toBe(true);
    expect("ok" in (await executeAction({ type: "note", itemId: 3, body: "jegyzet" }))).toBe(true);
    expect("ok" in (await executeAction({ type: "ticket", draft }))).toBe(true);
    const logged = m.assistantCall.create.mock.calls.map((c) => c[0].data);
    expect(logged.map((d) => d.action)).toEqual(["answer_decision", "note", "ticket"]);
    for (const d of logged) expect(d).toMatchObject({ purpose: "execute", userId: 5 });
  });
  it("create_decision creates the item and its check in one transaction", async () => {
    mock(getContentReviewers).mockResolvedValue([5]);
    m.assistantCall.create.mockResolvedValue({});
    const tx = {};
    mock(addChecks).mockResolvedValue({ ok: true, created: 1 });
    mock(db.$transaction).mockImplementation(async (fn: (t: unknown) => unknown) => fn(tx));
    mock(createItem).mockResolvedValue({ ok: true, itemId: 12 });
    const r = await executeAction({ type: "create_decision", question: "Mehet?", context: "c", options: ["a"], decidedBy: "peter" });
    expect(r).toMatchObject({ ok: true, href: "/marketing/12" });
    expect(createItem).toHaveBeenCalledWith(expect.anything(), expect.anything(), tx);
    expect(addChecks).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 1, userId: 5 }), 12, [{ question: "Mehet?", forWhom: "peter", source: "decision" }], tx,
    );
  });
  it("create_decision returns the error when addChecks fails (transaction rolls back)", async () => {
    mock(getContentReviewers).mockResolvedValue([5]);
    mock(db.$transaction).mockImplementation(async (fn: (t: unknown) => unknown) => fn({}));
    mock(createItem).mockResolvedValue({ ok: true, itemId: 12 });
    mock(addChecks).mockResolvedValue({ ok: false, error: "Nem található" });
    const r = await executeAction({ type: "create_decision", question: "Mehet?", context: "c", options: ["a"], decidedBy: "peter" });
    expect(r).toEqual({ error: "Nem található" });
    expect(m.assistantCall.create).not.toHaveBeenCalled();
  });
  it("answer_decision on an already resolved question is NOT_FOUND and writes nothing", async () => {
    m.contentCheck.findFirst.mockResolvedValue(null);
    expect(await executeAction({ type: "answer_decision", checkId: 2, answer: "igen" })).toEqual({ error: "Nem található" });
    expect(m.contentCheck.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ state: "open" }) }));
    expect(setContentCheck).not.toHaveBeenCalled();
  });
});

describe("executeAction client-only and state", () => {
  it("rejects open_item, navigate and waiting with BAD_INPUT and touches nothing", async () => {
    for (const p of [{ type: "open_item", itemId: 1 }, { type: "navigate", path: "/marketing" }, { type: "waiting" }] as const) {
      expect(await executeAction(p)).toEqual({ error: "Érvénytelen kérés." });
    }
    for (const t of Object.values(m)) if (typeof t === "object") for (const f of Object.values(t)) expect(f).not.toHaveBeenCalled();
    expect(submitContentReview).not.toHaveBeenCalled();
    expect(setContentCheck).not.toHaveBeenCalled();
  });
  it("review returns the item's status label as state after success", async () => {
    m.contentVersion.findFirst.mockResolvedValue({ id: 4 });
    m.contentItem.findFirst.mockResolvedValue({ status: "in_review" });
    m.assistantCall.create.mockResolvedValue({});
    mock(submitContentReview).mockResolvedValue({ ok: true, wentLive: false });
    const r = await executeAction({ type: "review", itemId: 9, versionId: 4, verdict: "approve" });
    expect(r).toEqual({ ok: true, message: "Rögzítve.", href: "/marketing/9", state: "Bírálatra vár" });
    expect(m.contentItem.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 9, tenantId: 1 } }));
  });
});

describe("whatsWaiting", () => {
  it("returns empty lists for a non-reviewer without loading page data", async () => {
    mock(getContentReviewers).mockResolvedValue([2]);
    m.user.findFirst.mockResolvedValue({ name: "Valaki" });
    expect(await whatsWaiting()).toEqual({ ok: true, waiting: { items: [], decisions: [] } });
    expect(loadPageData).not.toHaveBeenCalled();
  });
  it("lists exactly the items in mineIds", async () => {
    mock(getContentReviewers).mockResolvedValue([5]);
    m.user.findFirst.mockResolvedValue({ name: "Péter" });
    const row = (id: number) => ({ id, title: `T${id}`, status: "in_review", waitingSince: null, verdicts: [] });
    mock(loadPageData).mockResolvedValue({ now: new Date(), items: [row(1), row(2)], decisions: [], mineIds: [2] });
    const r = await whatsWaiting();
    expect(r).toMatchObject({ ok: true, waiting: { items: [{ id: 2 }], decisions: [] } });
  });
});
