import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { getScriptStats } from "./script-stats";
import type { ScriptVariant } from "./scripts";

const { db: mockDb } = vi.hoisted(() => ({
  db: { interaction: { groupBy: vi.fn() } },
}));
vi.mock("@/lib/db", () => ({ db: mockDb }));

const VARIANTS: ScriptVariant[] = [
  { key: "a", label: "A változat", body: "" },
  { key: "b", label: "B változat", body: "" },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getScriptStats", () => {
  it("scopes the query by tenant", async () => {
    mockDb.interaction.groupBy.mockResolvedValue([]);
    await getScriptStats(1, VARIANTS);
    expect(mockDb.interaction.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 1, type: "call" }),
      }),
    );
  });

  it("shows a (törölt) row for a key present in the data but not in the tenant's variants", async () => {
    mockDb.interaction.groupBy.mockResolvedValue([
      { scriptVariant: "old_deleted", outcome: "meeting_booked", _count: 2 },
    ]);
    const rows = await getScriptStats(1, VARIANTS);
    const row = rows.find((r) => r.key === "old_deleted");
    expect(row).toBeDefined();
    expect(row!.label).toBe("(törölt) old_deleted");
    expect(row!.calls).toBe(2);
  });

  it("demoRate is 0, not NaN, when reached === 0", async () => {
    mockDb.interaction.groupBy.mockResolvedValue([
      { scriptVariant: "a", outcome: "no_answer", _count: 5 },
    ]);
    const rows = await getScriptStats(1, VARIANTS);
    const a = rows.find((r) => r.key === "a")!;
    expect(a.calls).toBe(5);
    expect(a.reached).toBe(0);
    expect(a.demoRate).toBe(0);
  });

  it("reached excludes no_answer and wrong_number, and demoRate is meeting_booked / reached (not / calls)", async () => {
    mockDb.interaction.groupBy.mockResolvedValue([
      { scriptVariant: "a", outcome: "no_answer", _count: 3 },
      { scriptVariant: "a", outcome: "wrong_number", _count: 1 },
      { scriptVariant: "a", outcome: "meeting_booked", _count: 2 },
      { scriptVariant: "a", outcome: "not_interested", _count: 4 },
    ]);
    const rows = await getScriptStats(1, VARIANTS);
    const a = rows.find((r) => r.key === "a")!;
    expect(a.calls).toBe(10);
    expect(a.reached).toBe(6); // 10 - 3 (no_answer) - 1 (wrong_number)
    expect(a.demoRate).toBe(2 / 6); // NOT 2 / 10
  });

  it("sorts by calls descending", async () => {
    mockDb.interaction.groupBy.mockResolvedValue([
      { scriptVariant: "a", outcome: "meeting_booked", _count: 1 },
      { scriptVariant: "b", outcome: "meeting_booked", _count: 9 },
    ]);
    const rows = await getScriptStats(1, VARIANTS);
    expect(rows.map((r) => r.key)).toEqual(["b", "a"]);
  });
});
