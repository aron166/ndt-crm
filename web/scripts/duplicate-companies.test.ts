import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs script, no types
import { groupDuplicates } from "./duplicate-companies.mjs";

const row = (id: number, name: string, vat: string | null, website: string | null, links = 0, created = "2026-01-01") =>
  ({ id, name, vat_number: vat, website, created_at: created, contacts: links, leads: 0, deals: 0, tasks: 0 });

describe("groupDuplicates", () => {
  const rows = [
    row(1, "Alpha Kft.", "12345678-2-41", null),
    row(2, "Alpha Trading Zrt.", "12345678", null, 3),
    row(3, "CONTROL LABOR KFT.", null, null, 0, "2025-01-01"),
    row(4, "controllabor", null, null, 0, "2026-01-01"),
    row(5, "Beta Bt.", null, "https://www.beta.hu/kapcsolat"),
    row(6, "Gamma Kft.", null, "beta.hu"),
    row(7, "X Kft", null, null),
    row(8, "X Kft F.A.", null, null),
  ];
  const g = groupDuplicates(rows);
  const ids = (gs: { members: { id: number }[] }[]) => gs.map((x) => x.members.map((m) => m.id).sort());

  it("groups by VAT core, picking the most linked survivor", () => {
    expect(ids(g.vat)).toEqual([[1, 2]]);
    expect(g.vat[0].survivor).toBe(2);
  });
  it("groups by companyKey, oldest wins a tie, and keeps an F.A. row apart", () => {
    expect(ids(g.key)).toEqual([[3, 4]]);
    expect(g.key[0].survivor).toBe(3);
    expect(g.key[0].vatConflict).toBe(false);
    expect(groupDuplicates([row(1, "A Kft", "11111111", null), row(2, "A Zrt", "22222222", null)]).key[0].vatConflict).toBe(true);
  });
  it("groups by website domain ignoring www and path", () => {
    expect(ids(g.domain)).toEqual([[5, 6]]);
  });
  it("flags split groups where more than one member owns leads or deals", () => {
    const s = groupDuplicates([{ ...row(1, "A", null, null), leads: 1 }, { ...row(2, "A Kft", null, null), deals: 1 }]);
    expect(s.key[0].split).toBe(true);
  });
});
