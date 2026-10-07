import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { getActor } from "@/lib/actor";
import { getContentReviewers } from "@/lib/content/reviewers";
import { createItem } from "@/lib/content/service";
import { submitContentReview } from "@/app/actions/content";
import { loadPageData } from "@/lib/assistant/page-context";
import {
  openAssistant, askAssistant, draftTicket, fileTicket, addItemNote, whatsWaiting, proposeAction, executeAction,
} from "./assistant";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/actor", () => ({ getActor: vi.fn(), NOT_A_CRM_USER: "NOT_A_CRM_USER_MSG" }));
vi.mock("@/lib/db", () => ({
  db: {
    user: { findFirst: vi.fn() },
    contentItem: { findFirst: vi.fn() },
    contentNote: { findMany: vi.fn(), create: vi.fn() },
    contentCheck: { findFirst: vi.fn() },
    assistantCall: { create: vi.fn() },
  },
}));
vi.mock("@/lib/content/reviewers", () => ({ getContentReviewers: vi.fn() }));
vi.mock("@/lib/content/service", async () => ({
  ...(await vi.importActual<typeof import("@/lib/content/service")>("@/lib/content/service")),
  createItem: vi.fn(), addChecks: vi.fn(),
}));
vi.mock("@/app/actions/content", () => ({ submitContentReview: vi.fn(), setContentCheck: vi.fn() }));
vi.mock("@/lib/assistant/page-context", () => ({ loadPageData: vi.fn(), renderPageContext: vi.fn() }));
vi.mock("@/lib/assistant/cap", () => ({ capState: vi.fn(), CAP_EXCEEDED: "cap" }));
vi.mock("@/lib/assistant/context", async () => ({
  ...(await vi.importActual<typeof import("@/lib/assistant/context")>("@/lib/assistant/context")),
  loadItemContext: vi.fn(),
}));

const mock = <T>(f: T) => f as unknown as ReturnType<typeof vi.fn>;
type Dbm = Record<string, Record<string, ReturnType<typeof vi.fn>>>;
const m = db as unknown as Dbm;

const input = { pathname: "/marketing", itemId: null, messages: [{ role: "user" as const, content: "szia" }] };
const draft = { title: "Hiba van", body: "Részletes leírás a hibáról", label: "bug" as const, repo: "ndt-crm" as const };

beforeEach(() => {
  vi.clearAllMocks();
  mock(getActor).mockResolvedValue({ userId: 5, email: "a@b.hu" });
});

describe("denial for a non CRM user", () => {
  it("every action returns NOT_A_CRM_USER and writes nothing", async () => {
    mock(getActor).mockResolvedValue({ userId: null, email: null });
    const results = await Promise.all([
      openAssistant({ itemId: null }),
      askAssistant(input),
      draftTicket(input),
      fileTicket(draft),
      addItemNote({ itemId: 1, body: "x" }),
      whatsWaiting(),
      proposeAction(input),
      executeAction({ type: "note", itemId: 1, body: "x" }),
    ]);
    for (const r of results) expect(r).toEqual({ error: "NOT_A_CRM_USER_MSG" });
    for (const t of Object.values(m)) for (const f of Object.values(t)) expect(f).not.toHaveBeenCalled();
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
  it("review on another tenant's item is Nem található", async () => {
    m.contentItem.findFirst.mockResolvedValue(null);
    const r = await executeAction({ type: "review", itemId: 9, verdict: "approve" });
    expect(r).toEqual({ error: "Nem található" });
    expect(m.contentItem.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 9, tenantId: 1 } }));
    expect(submitContentReview).not.toHaveBeenCalled();
  });
});

describe("whatsWaiting", () => {
  it("returns empty lists for a non-reviewer without loading page data", async () => {
    mock(getContentReviewers).mockResolvedValue([2]);
    m.user.findFirst.mockResolvedValue({ name: "Valaki" });
    expect(await whatsWaiting()).toEqual({ ok: true, waiting: { items: [], decisions: [] } });
    expect(loadPageData).not.toHaveBeenCalled();
  });
});
