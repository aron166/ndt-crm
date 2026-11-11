import { afterEach, describe, expect, it } from "vitest";
import { proposeSlots } from "./slots";
import { atLocal, localMinuteOfDay } from "./time";
import { register, SERVER_TZ } from "@/instrumentation";

// The cockpit risk report (peter-cockpit README gap 6): "proposeSlots uses server-local hours
// (8 to 17); on Vercel (UTC) that would be 9 to 18 Budapest". Proven here, both halves:
// the legacy proposer IS server-timezone dependent, and two things keep production right.

const ORIGINAL_TZ = process.env.TZ;
afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

const budapestHour = (d: Date) =>
  Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Budapest", hour: "2-digit", hourCycle: "h23" }).format(d));

// Monday 2026-11-16, 06:00 Budapest: the proposer starts from that day.
const FROM = new Date("2026-11-16T05:00:00Z");

describe("server timezone and booking hours", () => {
  it("the risk is real: the legacy proposer under TZ=UTC offers 09:00 Budapest as its first slot", () => {
    process.env.TZ = "UTC";
    const [first] = proposeSlots({ target: null, existing: [], from: FROM, days: 1, count: 1 });
    expect(budapestHour(first.startsAt)).toBe(9);
  });

  it("the instrumentation pin fixes it: after register() the same call offers 08:00 Budapest", () => {
    process.env.TZ = "UTC";
    register();
    expect(process.env.TZ).toBe(SERVER_TZ);
    const [first] = proposeSlots({ target: null, existing: [], from: FROM, days: 1, count: 1 });
    expect(budapestHour(first.startsAt)).toBe(8);
  });

  it("the W8b path (booking drawer, GET /api/leads/:id/slots) is Budapest wall-clock under any server TZ", () => {
    for (const tz of ["UTC", "Asia/Tokyo", "America/Los_Angeles", "Europe/Budapest"]) {
      process.env.TZ = tz;
      const t = atLocal({ y: 2026, m: 11, d: 16 }, 8 * 60);
      expect(t.toISOString()).toBe("2026-11-16T07:00:00.000Z");
      expect(localMinuteOfDay(t)).toBe(8 * 60);
    }
  });
});
