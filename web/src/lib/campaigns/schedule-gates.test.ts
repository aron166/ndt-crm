import { describe, it, expect } from "vitest";
import { warmupCap, bounceStopped, inboxFresh, inSendWindow } from "./schedule-gates";

describe("warmupCap", () => {
  it("sends nothing without a start day, or before it", () => {
    expect(warmupCap(null, "2026-11-12", 0)).toBe(0);
    expect(warmupCap("nem-datum", "2026-11-12", 0)).toBe(0);
    expect(warmupCap("2026-11-13", "2026-11-12", 0)).toBe(0);
  });
  it("starts at 10, steps 2 per earlier sending day, tops out at 35", () => {
    expect(warmupCap("2026-11-12", "2026-11-12", 0)).toBe(10);
    expect(warmupCap("2026-11-01", "2026-11-12", 5)).toBe(20);
    expect(warmupCap("2026-11-01", "2026-11-12", 13)).toBe(35);
    expect(warmupCap("2026-11-01", "2026-11-12", 40)).toBe(35);
  });
});

describe("bounceStopped", () => {
  it("stops at 3% or more, never on an empty history", () => {
    expect(bounceStopped(0, 0)).toBe(false);
    expect(bounceStopped(34, 1)).toBe(false);
    expect(bounceStopped(33, 1)).toBe(true);
    expect(bounceStopped(100, 3)).toBe(true);
  });
});

describe("inboxFresh", () => {
  const now = new Date("2026-11-12T10:00:00Z");
  const ago = (min: number) => new Date(now.getTime() - min * 60_000).toISOString();
  it("needs a check within the hour", () => {
    expect(inboxFresh(null, now)).toBe(false);
    expect(inboxFresh("nope", now)).toBe(false);
    expect(inboxFresh(ago(59), now)).toBe(true);
    expect(inboxFresh(ago(61), now)).toBe(false);
  });
  it("does not trust a timestamp from the future", () => {
    expect(inboxFresh(ago(-4), now)).toBe(true);
    expect(inboxFresh(ago(-6), now)).toBe(false);
  });
});

describe("inSendWindow (Mon-Fri 08:30-16:30 Budapest, end exclusive)", () => {
  it("winter time (CET, UTC+1)", () => {
    expect(inSendWindow(new Date("2026-11-09T07:29:00Z"))).toBe(false); // Mon 08:29
    expect(inSendWindow(new Date("2026-11-09T07:30:00Z"))).toBe(true); // Mon 08:30
    expect(inSendWindow(new Date("2026-11-09T15:29:00Z"))).toBe(true); // 16:29
    expect(inSendWindow(new Date("2026-11-09T15:30:00Z"))).toBe(false); // 16:30
  });
  it("summer time (CEST, UTC+2)", () => {
    expect(inSendWindow(new Date("2026-06-15T06:29:00Z"))).toBe(false); // Mon 08:29
    expect(inSendWindow(new Date("2026-06-15T06:30:00Z"))).toBe(true); // Mon 08:30
    expect(inSendWindow(new Date("2026-06-15T14:30:00Z"))).toBe(false); // 16:30
  });
  it("not on a weekend", () => {
    expect(inSendWindow(new Date("2026-11-14T10:00:00Z"))).toBe(false); // Saturday
    expect(inSendWindow(new Date("2026-11-15T10:00:00Z"))).toBe(false); // Sunday
  });
});
