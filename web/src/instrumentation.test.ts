import { describe, it, expect, afterEach } from "vitest";
import { register, SERVER_TZ } from "./instrumentation";

describe("register() — server clock is Budapest", () => {
  const before = process.env.TZ;
  afterEach(() => { if (before === undefined) delete process.env.TZ; else process.env.TZ = before; });

  it("turns a UTC process into Budapest local time", () => {
    process.env.TZ = "UTC";
    expect(new Date("2026-07-01T06:00:00Z").getHours()).toBe(6);
    register();
    expect(process.env.TZ).toBe(SERVER_TZ);
    // CEST = UTC+2: 06:00Z is 08:00 local, the first bookable slot.
    expect(new Date("2026-07-01T06:00:00Z").getHours()).toBe(8);
    // CET = UTC+1 in winter.
    expect(new Date("2026-12-01T07:00:00Z").getHours()).toBe(8);
  });
});
