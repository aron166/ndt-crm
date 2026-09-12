import { describe, it, expect } from "vitest";
import {
  bookingRank,
  outranks,
  BOOKING_RANK,
  BOOKING_KINDS,
  JOB_VALUE_HIGH,
  JOB_VALUE_MID,
  type BookingPriorityInput,
} from "./priority";

const input = (p: Partial<BookingPriorityInput> = {}): BookingPriorityInput => ({
  kind: null,
  dealValue: null,
  estimatedValue: null,
  ...p,
});

describe("bookingRank — the priority ladder", () => {
  it("orders the full ladder: multi-unit demo < single machine demo < 1M+ job < 300k+ job < small job < private", () => {
    const ranks = [
      bookingRank(input({ kind: "multi_unit_demo" })),
      bookingRank(input({ kind: "single_machine_demo" })),
      bookingRank(input({ kind: "job", dealValue: 1_000_000 })),
      bookingRank(input({ kind: "job", dealValue: 300_000 })),
      bookingRank(input({ kind: "job", dealValue: 1_000 })),
      bookingRank(input({ kind: "private" })),
    ];
    for (let i = 0; i < ranks.length - 1; i++) {
      expect(ranks[i]).toBeLessThan(ranks[i + 1]);
    }
  });

  it("a job with no value at all ranks below every valued job but above private", () => {
    // A valueless job shares the lowest job rung (JOB_LOW) with a priced-but-small
    // job — it is not pushed below that rung, only down to it.
    const noValue = bookingRank(input({ kind: "job" }));
    const smallJob = bookingRank(input({ kind: "job", dealValue: 1_000 }));
    const midJob = bookingRank(input({ kind: "job", dealValue: JOB_VALUE_MID }));
    const highJob = bookingRank(input({ kind: "job", dealValue: JOB_VALUE_HIGH }));
    const priv = bookingRank(input({ kind: "private" }));

    expect(noValue).toBe(smallJob);
    expect(noValue).toBeGreaterThan(midJob);
    expect(noValue).toBeGreaterThan(highJob);
    expect(noValue).toBeLessThan(priv);
  });

  it("dealValue wins over estimatedValue when both are present", () => {
    // dealValue says high-value, estimatedValue says nothing of the sort — dealValue must win.
    const rank = bookingRank(
      input({ kind: "job", dealValue: JOB_VALUE_HIGH, estimatedValue: 1_000 }),
    );
    expect(rank).toBe(BOOKING_RANK.JOB_HIGH);

    // And the reverse: a low dealValue should not be rescued by a high estimatedValue.
    const rank2 = bookingRank(
      input({ kind: "job", dealValue: 1_000, estimatedValue: JOB_VALUE_HIGH }),
    );
    expect(rank2).toBe(BOOKING_RANK.JOB_LOW);
  });

  it("the 1M threshold takes the high rung exactly at the boundary", () => {
    expect(bookingRank(input({ kind: "job", dealValue: JOB_VALUE_HIGH }))).toBe(
      BOOKING_RANK.JOB_HIGH,
    );
    expect(bookingRank(input({ kind: "job", dealValue: JOB_VALUE_HIGH - 1 }))).toBe(
      BOOKING_RANK.JOB_MID,
    );
  });

  it("the 300k threshold takes the mid rung exactly at the boundary", () => {
    expect(bookingRank(input({ kind: "job", dealValue: JOB_VALUE_MID }))).toBe(
      BOOKING_RANK.JOB_MID,
    );
    expect(bookingRank(input({ kind: "job", dealValue: JOB_VALUE_MID - 1 }))).toBe(
      BOOKING_RANK.JOB_LOW,
    );
  });

  it("an unknown or null kind gets UNKNOWN", () => {
    expect(bookingRank(input({ kind: null }))).toBe(BOOKING_RANK.UNKNOWN);
    expect(bookingRank(input({ kind: "not_a_real_kind" }))).toBe(BOOKING_RANK.UNKNOWN);
  });

  it("BOOKING_KINDS lists exactly the four recognised kinds", () => {
    expect(BOOKING_KINDS).toEqual(["multi_unit_demo", "single_machine_demo", "job", "private"]);
  });
});

describe("outranks — strict comparison", () => {
  it("a higher-priority booking outranks a lower one", () => {
    expect(outranks(input({ kind: "multi_unit_demo" }), input({ kind: "private" }))).toBe(true);
    expect(outranks(input({ kind: "private" }), input({ kind: "multi_unit_demo" }))).toBe(false);
  });

  it("equal ranks never outrank each other", () => {
    const a = input({ kind: "job", dealValue: 500_000 });
    const b = input({ kind: "job", dealValue: 400_000 }); // same JOB_MID rung
    expect(outranks(a, b)).toBe(false);
    expect(outranks(b, a)).toBe(false);
  });
});
