import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(path.resolve(__dirname, "../app/(app)", p), "utf8");

// There is no deal page and the board opens a deal only from local state, so "Deal #N" cannot link to it.
describe("Deal #N is not a link to the board", () => {
  it("lead details shows the deal number as text", () => {
    expect(read("leads/[id]/v2/Details.tsx")).not.toMatch(/<Link[^>]*href="\/deals"/);
  });
  it("closed leads list shows the deal number as text", () => {
    expect(read("leads/closed/ClosedList.tsx")).not.toMatch(/<Link[^>]*href="\/deals"/);
  });
});
