import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(path.resolve(__dirname, "../app/(app)", p), "utf8");
const count = (src: string, needle: string) => src.split(needle).length - 1;

// Two controls on one screen making the identical call: only the header one stays.
describe("no duplicate controls on one screen", () => {
  it("person page has a single Naplózás button (the header action)", () => {
    expect(count(read("persons/[id]/PersonDetailClient.tsx"), "<LogInteractionButton")).toBe(1);
  });
  it("company page opens the add-contact modal from a single button (the header action)", () => {
    expect(count(read("companies/[id]/CompanyDetailClient.tsx"), "setAddOpen(true)")).toBe(1);
  });
});
