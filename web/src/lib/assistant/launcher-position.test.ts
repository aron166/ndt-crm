import { describe, expect, it } from "vitest";
import { clampPosition, loadPosition, savePosition, snapToEdge } from "./launcher-position";

const vp = { w: 400, h: 800 };
const size = { w: 100, h: 40 };
const ins = { top: 60, right: 8, bottom: 26, left: 8 };

describe("clampPosition", () => {
  it("pulls off-screen positions back inside the insets", () => {
    expect(clampPosition({ x: -50, y: -50 }, vp, size, ins)).toEqual({ x: 8, y: 60 });
    expect(clampPosition({ x: 999, y: 999 }, vp, size, ins)).toEqual({ x: 292, y: 734 });
  });
  it("leaves an inside position alone", () => {
    expect(clampPosition({ x: 100, y: 300 }, vp, size, ins)).toEqual({ x: 100, y: 300 });
  });
  it("pins to the top-left inset when the viewport is too small", () => {
    expect(clampPosition({ x: 50, y: 50 }, { w: 50, h: 50 }, size, ins)).toEqual({ x: 8, y: 60 });
  });
});

describe("snapToEdge", () => {
  it("snaps to the left in the left half and keeps y", () => {
    expect(snapToEdge({ x: 100, y: 321 }, vp, size, 12)).toEqual({ x: 12, y: 321 });
  });
  it("snaps to the right in the right half", () => {
    expect(snapToEdge({ x: 250, y: 321 }, vp, size, 12)).toEqual({ x: 288, y: 321 });
  });
});

describe("load/save", () => {
  const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };
  it("round trips", () => {
    const s = mem();
    savePosition(s, "k", { x: 1, y: 2 });
    expect(loadPosition(s, "k")).toEqual({ x: 1, y: 2 });
  });
  it("tolerates bad JSON and wrong shapes", () => {
    const s = mem();
    s.setItem("k", "{nope");
    expect(loadPosition(s, "k")).toBeNull();
    s.setItem("k", '{"x":"a","y":1}');
    expect(loadPosition(s, "k")).toBeNull();
    s.setItem("k", "null");
    expect(loadPosition(s, "k")).toBeNull();
  });
  it("tolerates throwing storage", () => {
    const bad = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
    expect(loadPosition(bad, "k")).toBeNull();
    expect(() => savePosition(bad, "k", { x: 1, y: 1 })).not.toThrow();
    expect(loadPosition(null, "k")).toBeNull();
  });
});
