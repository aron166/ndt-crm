import { describe, it, expect } from "vitest";
import { parseManualTest, bugIssueUrl } from "./parse";

describe("parseManualTest", () => {
  it("returns [] for null, missing or empty section", () => {
    expect(parseManualTest(null)).toEqual([]);
    expect(parseManualTest("## Summary\nstuff")).toEqual([]);
    expect(parseManualTest("## Manual test\n\n## Next\n1. x")).toEqual([]);
  });
  it("parses numbered items with . and )", () => {
    expect(parseManualTest("### Manual Test\n1. one\n2) two")).toEqual(["one", "two"]);
  });
  it("parses bullets and checkboxes", () => {
    expect(parseManualTest("## manual test\n- a\n- [ ] b\n- [x] c\n1. [ ] d")).toEqual(["a", "b", "c", "d"]);
  });
  it("handles CRLF", () => {
    expect(parseManualTest("## Manual test\r\n1. one\r\n2. two\r\n")).toEqual(["one", "two"]);
  });
  it("stops at the next heading", () => {
    expect(parseManualTest("## Manual test\n1. one\n# Other\n2. no")).toEqual(["one"]);
  });
  it("joins continuation lines", () => {
    expect(parseManualTest("## Manual test\n1. one\n   more\n2. two")).toEqual(["one more", "two"]);
  });
});

describe("bugIssueUrl", () => {
  it("encodes title, body and label", () => {
    const u = new URL(bugIssueUrl("ndt-crm", 7, "Fix & go", "x".repeat(100)));
    expect(u.pathname).toBe("/aron166/ndt-crm/issues/new");
    expect(u.searchParams.get("labels")).toBe("bug");
    expect(u.searchParams.get("title")).toBe(`Bug: PR #7 step: ${"x".repeat(80)}`);
    const body = u.searchParams.get("body")!;
    expect(body).toContain("https://github.com/aron166/ndt-crm/pull/7");
    expect(body).toContain("Expected:");
    expect(body).toContain("Actual:");
  });
});

describe("parseManualTest hardening", () => {
  it("indented sub-bullets continue the previous step", () => {
    expect(parseManualTest("## Manual test\n1. open /leads\n   - expect badge")).toEqual(["open /leads - expect badge"]);
  });
  it("an indented #123 line does not end the section", () => {
    expect(parseManualTest("## Manual test\n1. open\n   #118 now shows the badge\n2. two")).toEqual(["open #118 now shows the badge", "two"]);
  });
  it("ignores fenced blocks", () => {
    expect(parseManualTest("## Manual test\n1. a\n```\n# x\n1. y\n```\n2. b")).toEqual(["a", "b"]);
  });
  it("caps at 100 steps", () => {
    const body = "## Manual test\n" + Array.from({ length: 120 }, (_, i) => `${i + 1}. s${i}`).join("\n");
    expect(parseManualTest(body)).toHaveLength(100);
  });
});

describe("parseManualTest indented list", () => {
  it("reads a numbered list indented 1 to 3 spaces as separate steps", () => {
    expect(parseManualTest("## Manual test\n 1. a\n 2. b")).toEqual(["a", "b"]);
  });
});
