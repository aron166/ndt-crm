import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseDraft } from "./import";

const DIR = "/home/aron166/Projects/workspace/docs/birdsview/content/drafts";
const mk = (sources: string, head = "**Tárgy:** T\n**Előnézet:** P", body = "Szia") =>
  `---\nsources:\n  - ${sources}\n---\n\n${head}\n\n---\n\n${body}\n`;

describe("parseDraft units", () => {
  it("parses a minimal draft", () => {
    expect(parseDraft("a.md", mk("x (topic #2)"))).toEqual({
      key: "topic-02", subject: "T", preview: "P", bodyMd: "Szia", requiresAsset: null,
    });
  });
  it("errors without topic", () => expect(parseDraft("a.md", mk("x"))).toHaveProperty("error"));
  it("errors without subject", () =>
    expect(parseDraft("a.md", mk("x (topic #1)", "**Előnézet:** P"))).toHaveProperty("error"));
  it("flags video mentions", () => {
    const r = parseDraft("a.md", mk("x (topic #1)", undefined, "Nézze meg a videót"));
    expect(r).toMatchObject({ requiresAsset: "summary-video" });
    expect(parseDraft("a.md", mk("x (topic #1)", undefined, "[VIDEO]"))).toMatchObject({ requiresAsset: "summary-video" });
  });
});

describe.skipIf(!fs.existsSync(DIR))("real drafts", () => {
  const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => /-email\.md$/.test(f)) : [];
  it("finds drafts", () => expect(files.length).toBeGreaterThan(0));
  for (const f of files) {
    it(f, () => {
      const r = parseDraft(f, fs.readFileSync(path.join(DIR, f), "utf8"));
      if ("error" in r) throw new Error(r.error);
      expect(r.key).toMatch(/^topic-\d{2}$/);
      expect(r.subject).not.toBe("");
      expect(r.preview).not.toBe("");
      expect(r.bodyMd).not.toBe("");
      expect(r.bodyMd).not.toContain("**Tárgy:**");
    });
  }
});
