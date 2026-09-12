import { describe, it, expect } from "vitest";
import {
  overlapMinutes,
  findConflicts,
  conflictsFor,
  DEFAULT_BOOKING_MINUTES,
  TRAVEL_BUFFER_MINUTES,
  type Booking,
} from "./conflicts";

const at = (iso: string) => new Date(iso);
const booking = (p: Partial<Booking> & Pick<Booking, "id">): Booking => ({
  startsAt: at("2026-09-14T09:00:00Z"),
  kind: "job",
  assignedToId: 1,
  minutes: 60,
  ...p,
});

describe("overlapMinutes", () => {
  it("back-to-back bookings conflict: nobody teleports between two addresses", () => {
    const a = booking({ id: 1, startsAt: at("2026-09-14T09:00:00Z"), minutes: 60, assignedToId: 1 });
    const b = booking({ id: 2, startsAt: at("2026-09-14T10:00:00Z"), minutes: 60, assignedToId: 1 });
    // Zero gap eats the whole travel buffer.
    expect(overlapMinutes(a, b)).toBe(TRAVEL_BUFFER_MINUTES);
  });

  it("a gap shorter than the travel buffer still conflicts, by how much it eats", () => {
    const a = booking({ id: 1, startsAt: at("2026-09-14T09:00:00Z"), minutes: 60, assignedToId: 1 });
    const b = booking({ id: 2, startsAt: at("2026-09-14T10:20:00Z"), minutes: 60, assignedToId: 1 });
    expect(overlapMinutes(a, b)).toBe(TRAVEL_BUFFER_MINUTES - 20);
  });

  it("a gap at least as long as the travel buffer is fine", () => {
    const a = booking({ id: 1, startsAt: at("2026-09-14T09:00:00Z"), minutes: 60, assignedToId: 1 });
    const b = booking({ id: 2, startsAt: at("2026-09-14T10:30:00Z"), minutes: 60, assignedToId: 1 });
    expect(overlapMinutes(a, b)).toBe(0);
  });

  it("two bookings for different people never conflict, even at the exact same minute", () => {
    const a = booking({ id: 1, assignedToId: 1, startsAt: at("2026-09-14T09:00:00Z") });
    const b = booking({ id: 2, assignedToId: 2, startsAt: at("2026-09-14T09:00:00Z") });
    expect(overlapMinutes(a, b)).toBe(0);
  });

  it("same person, plainly overlapping times conflict with the right overlap minutes", () => {
    // a: 09:00-10:00, b: 09:30-10:30 -> overlap is 09:30-10:00 = 30 minutes.
    const a = booking({ id: 1, assignedToId: 1, startsAt: at("2026-09-14T09:00:00Z"), minutes: 60 });
    const b = booking({ id: 2, assignedToId: 1, startsAt: at("2026-09-14T09:30:00Z"), minutes: 60 });
    expect(overlapMinutes(a, b)).toBe(30);
    expect(overlapMinutes(b, a)).toBe(30);
  });

  it("bookings far enough apart do not conflict", () => {
    const a = booking({ id: 1, assignedToId: 1, startsAt: at("2026-09-14T09:00:00Z"), minutes: 60 });
    const b = booking({ id: 2, assignedToId: 1, startsAt: at("2026-09-14T14:00:00Z"), minutes: 60 });
    expect(overlapMinutes(a, b)).toBe(0);
  });

  it("a missing minutes falls back to DEFAULT_BOOKING_MINUTES", () => {
    // a has no `minutes` -> should behave as if it runs DEFAULT_BOOKING_MINUTES (90),
    // i.e. 09:00-10:30, which overlaps a 10:00-11:00 booking by 30 minutes.
    const a = booking({ id: 1, assignedToId: 1, startsAt: at("2026-09-14T09:00:00Z"), minutes: undefined });
    const b = booking({ id: 2, assignedToId: 1, startsAt: at("2026-09-14T10:00:00Z"), minutes: 60 });
    expect(DEFAULT_BOOKING_MINUTES).toBe(90);
    expect(overlapMinutes(a, b)).toBe(30);
  });

  it("a zero minutes also falls back to DEFAULT_BOOKING_MINUTES", () => {
    const a = booking({ id: 1, assignedToId: 1, startsAt: at("2026-09-14T09:00:00Z"), minutes: 0 });
    const b = booking({ id: 2, assignedToId: 1, startsAt: at("2026-09-14T10:00:00Z"), minutes: 60 });
    expect(overlapMinutes(a, b)).toBe(30);
  });

  // The buffer's EFFECT is asserted at the top of this block; this only pins
  // the documented value so a change to it is a deliberate edit.
  it("TRAVEL_BUFFER_MINUTES constant is what conflicts.ts documents (30)", () => {
    expect(TRAVEL_BUFFER_MINUTES).toBe(30);
  });
});

describe("findConflicts", () => {
  it("marks the lower-priority booking as bump regardless of which was passed first", () => {
    const high = booking({
      id: 1,
      kind: "multi_unit_demo",
      assignedToId: 1,
      startsAt: at("2026-09-14T09:00:00Z"),
      minutes: 60,
    });
    const low = booking({
      id: 2,
      kind: "private",
      assignedToId: 1,
      startsAt: at("2026-09-14T09:30:00Z"),
      minutes: 60,
    });

    for (const pair of [
      [high, low],
      [low, high],
    ]) {
      const conflicts = findConflicts(pair);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].keep.id).toBe(1);
      expect(conflicts[0].bump.id).toBe(2);
    }
  });

  it("equal ranks mark the later-starting one as bump", () => {
    const earlier = booking({
      id: 1,
      kind: "job",
      dealValue: 500_000,
      assignedToId: 1,
      startsAt: at("2026-09-14T09:00:00Z"),
      minutes: 60,
    });
    const later = booking({
      id: 2,
      kind: "job",
      dealValue: 400_000, // same JOB_MID rung as `earlier`
      assignedToId: 1,
      startsAt: at("2026-09-14T09:30:00Z"),
      minutes: 60,
    });

    for (const pair of [
      [earlier, later],
      [later, earlier],
    ]) {
      const conflicts = findConflicts(pair);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].keep.id).toBe(1);
      expect(conflicts[0].bump.id).toBe(2);
    }
  });

  it("reports no conflict for non-overlapping or different-owner bookings", () => {
    const a = booking({ id: 1, assignedToId: 1, startsAt: at("2026-09-14T09:00:00Z") });
    const b = booking({ id: 2, assignedToId: 2, startsAt: at("2026-09-14T09:00:00Z") });
    expect(findConflicts([a, b])).toEqual([]);
  });
});

describe("conflictsFor", () => {
  it("returns only the pairs involving the candidate", () => {
    const candidate = booking({
      id: 1,
      kind: "private",
      assignedToId: 1,
      startsAt: at("2026-09-14T09:00:00Z"),
      minutes: 60,
    });
    // Conflicts with the candidate (same owner, overlapping).
    const conflictsWithCandidate = booking({
      id: 2,
      kind: "job",
      dealValue: 2_000_000,
      assignedToId: 1,
      startsAt: at("2026-09-14T09:30:00Z"),
      minutes: 60,
    });
    // A separate pair that conflicts with EACH OTHER but not with the candidate
    // (different owner).
    const otherA = booking({
      id: 3,
      assignedToId: 2,
      startsAt: at("2026-09-14T10:00:00Z"),
      minutes: 60,
    });
    const otherB = booking({
      id: 4,
      assignedToId: 2,
      startsAt: at("2026-09-14T10:15:00Z"),
      minutes: 60,
    });

    const result = conflictsFor(candidate, [conflictsWithCandidate, otherA, otherB]);

    expect(result).toHaveLength(1);
    expect([result[0].keep.id, result[0].bump.id].sort()).toEqual([1, 2]);
  });
});
