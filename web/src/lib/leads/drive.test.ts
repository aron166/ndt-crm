import { describe, it, expect } from "vitest";
import { compareDriveCandidates, type DriveCandidate } from "./drive";

const at = (iso: string) => new Date(iso);
const lead = (p: Partial<DriveCandidate>): DriveCandidate => ({
  callbackDue: false,
  dueAt: null,
  tier: null,
  receivedDate: null,
  ...p,
});

describe("compareDriveCandidates — the /drive priority ladder", () => {
  const order = (items: DriveCandidate[]) => [...items].sort(compareDriveCandidates);

  it("an owed callback beats a tier-A lead", () => {
    const callback = lead({ callbackDue: true, dueAt: at("2026-09-12T08:00:00Z"), tier: "E" });
    const tierA = lead({ tier: "A" });
    expect(order([tierA, callback])[0]).toBe(callback);
  });

  it("among owed callbacks, the longest overdue goes first", () => {
    const older = lead({ callbackDue: true, dueAt: at("2026-09-10T08:00:00Z") });
    const newer = lead({ callbackDue: true, dueAt: at("2026-09-12T08:00:00Z") });
    expect(order([newer, older])[0]).toBe(older);
  });

  it("sorts tier A before B before E", () => {
    const [a, b, e] = [lead({ tier: "A" }), lead({ tier: "B" }), lead({ tier: "E" })];
    expect(order([e, b, a])).toEqual([a, b, e]);
  });

  it("an untiered lead sorts after every tiered one", () => {
    const untiered = lead({ tier: null });
    const worst = lead({ tier: "E" });
    expect(order([untiered, worst])).toEqual([worst, untiered]);
  });

  it("an unknown tier string is treated as untiered, not as tier A", () => {
    const junk = lead({ tier: "Z" });
    const real = lead({ tier: "E" });
    expect(order([junk, real])[0]).toBe(real);
  });

  it("within one tier, the oldest lead goes first", () => {
    const old = lead({ tier: "B", receivedDate: at("2026-08-01T00:00:00Z") });
    const fresh = lead({ tier: "B", receivedDate: at("2026-09-01T00:00:00Z") });
    expect(order([fresh, old])).toEqual([old, fresh]);
  });

  it("a lead with no received date sorts last within its tier", () => {
    const dated = lead({ tier: "C", receivedDate: at("2026-09-01T00:00:00Z") });
    const undated = lead({ tier: "C", receivedDate: null });
    expect(order([undated, dated])).toEqual([dated, undated]);
  });

  it("a callback scheduled for the future does not jump the queue (callbackDue false)", () => {
    const future = lead({ callbackDue: false, dueAt: at("2026-09-20T08:00:00Z"), tier: "D" });
    const tierA = lead({ tier: "A" });
    expect(order([future, tierA])[0]).toBe(tierA);
  });

  it("equal dueAt among owed callbacks keeps a stable order", () => {
    const same = at("2026-09-10T08:00:00Z");
    const first = lead({ callbackDue: true, dueAt: same, tier: "A" });
    const second = lead({ callbackDue: true, dueAt: same, tier: "B" });
    expect(order([first, second])).toEqual([first, second]);
    expect(order([second, first])).toEqual([second, first]);
  });

  it("a callbackDue candidate with a null dueAt does not throw", () => {
    const broken = lead({ callbackDue: true, dueAt: null });
    const tierA = lead({ tier: "A" });
    expect(() => order([tierA, broken])).not.toThrow();
    expect(order([tierA, broken])[0]).toBe(broken);
  });
});
