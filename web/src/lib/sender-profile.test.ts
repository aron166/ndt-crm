import { describe, it, expect } from "vitest";
import { normalizeSenderProfile } from "./sender-profile";

describe("normalizeSenderProfile", () => {
  it.each([
    ["+36 30 123 4567", "+36 30 123 4567"],
    ["06301234567", "+36 30 123 4567"],
    ["06 30 123-4567", "+36 30 123 4567"],
    ["0036301234567", "+36 30 123 4567"],
    ["(06) 20 123 4567", "+36 20 123 4567"],
    ["+36 1 234 5678", "+36 1 234 5678"],
    ["06 1 234 5678", "+36 1 234 5678"],
    ["+36 22 123 456", "+36 22 123 456"],
  ])("accepts Hungarian %s", (raw, out) => {
    expect(normalizeSenderProfile({ name: "Nagy Péter", phone: raw })).toEqual({ ok: true, name: "Nagy Péter", phone: out });
  });
  it("keeps a foreign international number readable", () => {
    expect(normalizeSenderProfile({ name: "A B", phone: "+43 660 1234567" })).toEqual({ ok: true, name: "A B", phone: "+43 660 1234567" });
  });
  it.each(["123", "abc", "+36 30 123", "06 30 123 45678901", "0630 1234567x"])("rejects %s", (raw) => {
    expect(normalizeSenderProfile({ name: "Nagy Péter", phone: raw })).toMatchObject({ ok: false });
  });
  it("empty phone clears it; name is required and trimmed; overlong name refused", () => {
    expect(normalizeSenderProfile({ name: "  Péter  ", phone: "  " })).toEqual({ ok: true, name: "Péter", phone: null });
    expect(normalizeSenderProfile({ name: " ", phone: "" })).toMatchObject({ ok: false });
    expect(normalizeSenderProfile({ name: "x".repeat(121), phone: "" })).toMatchObject({ ok: false });
  });
});
