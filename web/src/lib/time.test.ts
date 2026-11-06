import { describe, expect, it } from "vitest";
import { budapestParts, budapestYmd } from "./time";

describe("budapest clock", () => {
  it.each([
    ["2026-03-29T00:30:00Z", 1, "Sun", "2026-03-29"], // before spring-forward (CET)
    ["2026-03-29T01:30:00Z", 3, "Sun", "2026-03-29"], // after (CEST)
    ["2026-10-25T00:30:00Z", 2, "Sun", "2026-10-25"], // before fall-back (CEST)
    ["2026-10-25T01:30:00Z", 2, "Sun", "2026-10-25"], // after (CET)
    ["2026-07-06T06:00:00Z", 8, "Mon", "2026-07-06"],
    ["2026-12-07T05:00:00Z", 6, "Mon", "2026-12-07"],
    ["2026-06-30T22:30:00Z", 0, "Wed", "2026-07-01"], // date rolls over in Budapest first
  ])("%s", (iso, hour, weekday, ymd) => {
    const d = new Date(iso);
    expect(budapestParts(d)).toEqual({ hour, weekday, ymd });
    expect(budapestYmd(d)).toBe(ymd);
  });
});
