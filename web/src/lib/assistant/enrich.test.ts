import { describe, it, expect, vi, beforeEach } from "vitest";

const { db } = vi.hoisted(() => ({
  db: { contentItem: { findMany: vi.fn() }, contentCheck: { findMany: vi.fn() } },
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db }));

import { enrichProposals } from "./enrich";
import type { ActionProposal } from "./actions";

beforeEach(() => {
  db.contentItem.findMany.mockReset().mockResolvedValue([{ id: 1, title: "Hírlevél", currentVersionId: 11 }]);
  db.contentCheck.findMany.mockReset().mockResolvedValue([{ id: 7, question: "Mehet?" }]);
});

describe("enrichProposals", () => {
  it("drops foreign or unknown item ids", async () => {
    const cards = await enrichProposals(1, [
      { type: "note", itemId: 1, body: "x" }, { type: "note", itemId: 99, body: "y" }, { type: "open_item", itemId: 98 },
    ]);
    expect(cards).toHaveLength(1);
    expect(cards[0].summary).toBe("Jegyzet: #1 Hírlevél");
  });
  it("pins a review to currentVersionId, ignoring the model's versionId", async () => {
    const [c] = await enrichProposals(1, [{ type: "review", itemId: 1, verdict: "approve", versionId: 5 }]);
    expect(c.proposal).toMatchObject({ type: "review", versionId: 11 });
  });
  it("drops a review of an item without a current version", async () => {
    db.contentItem.findMany.mockResolvedValue([{ id: 1, title: "T", currentVersionId: null }]);
    expect(await enrichProposals(1, [{ type: "review", itemId: 1, verdict: "approve" }])).toEqual([]);
  });
  it("answer_decision only for open checks in the tenant, named by the question", async () => {
    const cards = await enrichProposals(1, [
      { type: "answer_decision", checkId: 7, answer: "igen" }, { type: "answer_decision", checkId: 8, answer: "nem" },
    ]);
    expect(cards.map((c) => c.summary)).toEqual(["Válasz a kérdésre: Mehet?"]);
    expect(db.contentCheck.findMany.mock.calls[0][0].where).toEqual({ tenantId: 1, id: { in: [7, 8] }, state: "open" });
  });
  it("queries are tenant scoped", async () => {
    await enrichProposals(4, [{ type: "note", itemId: 1, body: "x" }, { type: "answer_decision", checkId: 7, answer: "igen" }]);
    expect(db.contentItem.findMany.mock.calls[0][0].where).toMatchObject({ tenantId: 4 });
    expect(db.contentCheck.findMany.mock.calls[0][0].where).toMatchObject({ tenantId: 4 });
  });
  it("runs at most 2 queries for 3 actions, and none when no ids are needed", async () => {
    await enrichProposals(1, [
      { type: "note", itemId: 1, body: "x" }, { type: "review", itemId: 1, verdict: "approve" }, { type: "answer_decision", checkId: 7, answer: "igen" },
    ]);
    expect(db.contentItem.findMany.mock.calls.length + db.contentCheck.findMany.mock.calls.length).toBe(2);
    db.contentItem.findMany.mockClear(); db.contentCheck.findMany.mockClear();
    const cards = await enrichProposals(1, [{ type: "waiting" }, { type: "navigate", path: "/marketing" }] as ActionProposal[]);
    expect(cards).toHaveLength(2);
    expect(db.contentItem.findMany).not.toHaveBeenCalled();
    expect(db.contentCheck.findMany).not.toHaveBeenCalled();
  });
});
