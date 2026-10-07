import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { toRepoData } from "./github";

const now = Date.parse("2026-10-07T12:00:00Z");
const pr = (number: number, merged_at: string | null, body = "## Manual test\n1. a") => ({
  number, title: `t${number}`, html_url: `u${number}`, merged_at, body, user: { login: "n" },
});

describe("toRepoData", () => {
  const d = toRepoData(
    "ndt-crm",
    [pr(1, "2026-10-01T00:00:00Z"), pr(2, null), pr(3, "2026-10-06T00:00:00Z"), pr(4, "2026-08-01T00:00:00Z")],
    [{ number: 9, title: "b", html_url: "ub" }, { number: 10, title: "p", html_url: "up", pull_request: {} }],
    [{ number: 11, title: "d", html_url: "ud" }],
    now,
  );
  it("drops unmerged and sorts newest first", () => {
    expect(d.merged.map((p) => p.number)).toEqual([3, 1, 4]);
  });
  it("counts 7 and 28 days", () => {
    expect(d.merged7).toBe(2);
    expect(d.merged28).toBe(2);
  });
  it("drops PRs from issue lists and parses steps", () => {
    expect(d.backlog).toEqual([{ number: 9, title: "b", url: "ub" }]);
    expect(d.decisionAron).toHaveLength(1);
    expect(d.merged[0].steps).toEqual(["a"]);
  });
});
