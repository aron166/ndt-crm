import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(path.resolve(__dirname, "../app/(app)/campaigns/[slug]/CampaignAutomations.tsx"), "utf8");

// /automations asks before deleting a rule; the campaign page must ask with the same text.
describe("campaign page automation delete", () => {
  it("confirms before deleteAutomation, same text as /automations", () => {
    expect(src).toMatch(/confirm\("Biztosan törlöd ezt a szabályt\?"\)[^;]*deleteAutomation/s);
  });
});
