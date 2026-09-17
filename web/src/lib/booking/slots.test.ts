import { describe, it, expect } from "vitest";
import { proposeSlots, haversineKm, type SlotBooking, type ProposeSlotsInput } from "./slots";

// Fixed local dates: month is 0-indexed, so day(14) = Mon 2026-09-14.
const day = (d: number, h = 0, m = 0) => new Date(2026, 8, d, h, m);

const BUDAPEST = { lat: 47.4979, lng: 19.0402 };
const GYOR = { lat: 47.6875, lng: 17.6504 };

const propose = (overrides: Partial<ProposeSlotsInput>): ReturnType<typeof proposeSlots> =>
  proposeSlots({ target: null, existing: [], from: day(14, 8, 0), ...overrides });

const existingBooking = (p: Partial<SlotBooking> & Pick<SlotBooking, "id">): SlotBooking => ({
  startsAt: day(14, 10, 0),
  kind: "job",
  assignedToId: 1,
  minutes: 60,
  ...p,
});

describe("haversineKm", () => {
  it("is ~0 for identical points", () => {
    expect(haversineKm(BUDAPEST, BUDAPEST)).toBeCloseTo(0, 6);
  });

  it("is roughly right for a known pair (Budapest to Győr, ~105-115km)", () => {
    const km = haversineKm(BUDAPEST, GYOR);
    expect(km).toBeGreaterThanOrEqual(105);
    expect(km).toBeLessThanOrEqual(115);
  });
});

describe("proposeSlots", () => {
  it("returns at most `count` proposals", () => {
    const result = propose({ count: 2, days: 10 });
    expect(result.length).toBeLessThanOrEqual(2);
  });

  it("never proposes a weekend slot", () => {
    // Starting on a Friday, with enough days to span the weekend.
    const result = propose({ from: day(18, 8, 0), days: 5, count: 10 });
    for (const slot of result) {
      const dow = slot.startsAt.getDay();
      expect(dow).not.toBe(0);
      expect(dow).not.toBe(6);
    }
  });

  it("never proposes a start before `from`", () => {
    const from = day(14, 9, 30);
    const result = propose({ from, count: 5 });
    for (const slot of result) {
      expect(slot.startsAt.getTime()).toBeGreaterThanOrEqual(from.getTime());
    }
  });

  it("never proposes a slot that collides with an existing booking for the same person", () => {
    // Book the entire workday (08:00-17:00) for assignedToId 1 on the Monday.
    const existing = [
      existingBooking({ id: 6, assignedToId: 1, startsAt: day(14, 8, 0), minutes: 9 * 60 }),
    ];
    const result = propose({ existing, assignedToId: 1, count: 3, days: 5 });
    // The fully-booked Monday must be skipped entirely.
    expect(result.some((s) => s.startsAt.toDateString() === day(14).toDateString())).toBe(false);
    // And none of the proposals may actually overlap the booking.
    for (const slot of result) {
      const bookedStart = existing[0].startsAt.getTime();
      const bookedEnd = bookedStart + 9 * 60 * 60_000;
      expect(slot.startsAt.getTime() >= bookedEnd || slot.startsAt.getTime() < bookedStart).toBe(
        true,
      );
    }
  });

  it("ranks a slot near an existing booking that day (same_area) ahead of an empty free_day", () => {
    const existing = [
      existingBooking({
        id: 5,
        assignedToId: 1,
        startsAt: day(14, 10, 0),
        minutes: 60,
        point: BUDAPEST,
      }),
    ];
    // Target is a few hundred meters from the existing booking's point -> same area.
    const result = propose({
      target: { lat: 47.5, lng: 19.05 },
      existing,
      assignedToId: 1,
      count: 5,
    });
    expect(result[0].reason).toBe("same_area");
    expect(result.some((s) => s.reason === "free_day")).toBe(true);
    const sameAreaIndex = result.findIndex((s) => s.reason === "same_area");
    const freeDayIndex = result.findIndex((s) => s.reason === "free_day");
    expect(sameAreaIndex).toBeLessThan(freeDayIndex);
  });

  it("with target: null, no proposal claims same_area", () => {
    const existing = [
      existingBooking({
        id: 5,
        assignedToId: 1,
        startsAt: day(14, 10, 0),
        minutes: 60,
        point: BUDAPEST,
      }),
    ];
    const result = propose({ target: null, existing, count: 5 });
    expect(result.every((s) => s.reason !== "same_area")).toBe(true);
  });

  it("fits the slot inside the workday — a 180-minute visit never starts at 16:00 with dayEndHour: 17", () => {
    const result = propose({ minutes: 180, dayStartHour: 8, dayEndHour: 17, count: 10, days: 10 });
    for (const slot of result) {
      expect(slot.startsAt.getHours()).not.toBe(16);
      // The visit must also actually end by 17:00.
      const endMinutesFromMidnight = slot.startsAt.getHours() * 60 + slot.startsAt.getMinutes() + 180;
      expect(endMinutesFromMidnight).toBeLessThanOrEqual(17 * 60);
    }
  });
});
