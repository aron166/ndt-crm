import { describe, it, expect } from "vitest";
import { buildTimeline, type TimelineInput } from "./timeline";

const base: TimelineInput = {
  interactions: [], auditEntries: [], statusHistory: [], tasks: [], offers: [], documents: [],
  lead: { message: "Szeretnék ajánlatot", receivedDate: "2026-11-01T08:00:00Z", createdAt: "2026-11-01T08:00:00Z" },
};

describe("buildTimeline", () => {
  it("orders newest first with the form last", () => {
    const t = buildTimeline({
      ...base,
      interactions: [
        { id: 1, type: "call", direction: "outbound", outcome: "no_answer", notes: "nem vette fel", occurredAt: "2026-11-02T09:00:00Z", user: { name: "Áron" } },
        { id: 2, type: "email", direction: "outbound", outcome: null, notes: null, occurredAt: "2026-11-05T09:00:00Z" },
      ],
      documents: [{ id: 3, kind: "order", number: "MR-2026-0001", createdAt: "2026-11-04T09:00:00Z" }],
    });
    expect(t.map((x) => x.id)).toEqual(["i-2", "d-3", "i-1", "form"]);
    expect(t[t.length - 1]).toMatchObject({ kind: "form", body: "Szeretnék ajánlatot" });
  });

  it("maps kinds", () => {
    const t = buildTimeline({
      ...base,
      interactions: [
        { id: 1, type: "call", direction: null, outcome: "no_answer", notes: null, occurredAt: "2026-11-02T09:00:00Z" },
        { id: 2, type: "email", direction: null, outcome: null, notes: null, occurredAt: "2026-11-02T10:00:00Z" },
        { id: 3, type: "meeting", direction: null, outcome: null, notes: "x", occurredAt: "2026-11-02T11:00:00Z" },
      ],
      tasks: [
        { id: 4, title: "Demó", type: "meeting", status: "completed", dueDate: "2026-11-03T09:00:00Z" },
        { id: 5, title: "Hívás", type: "call", status: "created", dueDate: "2026-11-03T10:00:00Z" },
        { id: 6, title: "Régi hívás", type: "call", status: "completed", dueDate: "2026-11-03T11:00:00Z" },
        { id: 7, title: "Dátum nélkül", type: "call", status: "created", dueDate: null },
      ],
      offers: [{ id: 8, quoteNumber: "A-1", status: "sent", createdAt: "2026-11-02T08:00:00Z", sentAt: "2026-11-02T08:30:00Z", acceptedAt: null }],
    });
    const kind = (id: string) => t.find((x) => x.id === id)?.kind;
    expect([kind("i-1"), kind("i-2"), kind("i-3"), kind("t-4"), kind("t-5"), kind("o-8")]).toEqual(["call", "email", "note", "booking", "task", "offer"]);
    expect(t.find((x) => x.id === "t-6")).toBeUndefined();
    expect(t.find((x) => x.id === "t-7")).toBeUndefined();
    expect(t.find((x) => x.id === "o-8")?.title).toBe("Ajánlat elküldve: A-1");
  });

  it("shows a stage change logged in audit and history once", () => {
    const t = buildTimeline({
      ...base,
      stageLabels: { qualified: "Minősített", offer_sent: "Ajánlat kiküldve" },
      statusHistory: [{ id: 1, fromStatus: "qualified", toStatus: "offer_sent", event: "offer_sent", at: "2026-11-03T09:00:00Z", actorUser: { name: "Áron" } }],
      auditEntries: [
        { id: 10, occurredAt: "2026-11-03T09:00:01Z", changes: { before: { status: "qualified" }, after: { status: "offer_sent" } } },
        { id: 11, occurredAt: "2026-11-04T09:00:00Z", changes: { before: { assignedToId: 1 }, after: { assignedToId: 2 } } },
        { id: 12, occurredAt: "2026-11-02T09:00:00Z", changes: { before: { status: "new" }, after: { status: "qualified" } } },
      ],
    });
    const stages = t.filter((x) => x.kind === "stage");
    expect(stages.map((x) => x.id)).toEqual(["h-1", "a-12"]);
    expect(stages[0].title).toBe("Szakasz: Minősített → Ajánlat kiküldve");
  });
});
