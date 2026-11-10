import { describe, expect, it } from "vitest";
import { scanLine } from "./check-design.mjs";

const names = (file: string, line: string) => (scanLine(file, line) as [string, string][]).map((h) => h[0]);

describe("scanLine", () => {
  it("flags legacy vars, also with fallback", () => {
    expect(names("a.tsx", "color: var(--fg-muted)")).toEqual(["legacy var"]);
    expect(names("a.tsx", "color: var(--bg-card, #fff)")).toContain("legacy var");
  });
  it("flags raw Astryx vars, also with fallback", () => {
    expect(names("a.tsx", "x: var(--color-surface)")).toEqual(["raw Astryx var"]);
    expect(names("a.css", "x: var(--color-surface, red)")).toEqual(["raw Astryx var"]);
  });
  it("flags palette classes and white/black classes", () => {
    expect(names("a.tsx", 'className="bg-red-500"')).toEqual(["palette class"]);
    expect(names("a.tsx", 'className="text-white bg-black"')).toEqual(["tailwind white/black", "tailwind white/black"]);
  });
  it("flags hex of 3 to 8 digits", () => {
    for (const h of ["#abc", "#aabbcc", "#aabbccdd"]) expect(names("a.ts", `c = "${h}"`)).toEqual(["raw hex"]);
    expect(names("a.ts", 'id = `${"#"}101`')).toEqual([]);
  });
  it("flags colour functions", () => {
    for (const f of ["rgb(0 0 0)", "rgba(0,0,0,.5)", "hsl(1 2% 3%)", "hsla(1,2%,3%,1)", "oklch(0.5 0 0)", "oklab(0.5 0 0)"])
      expect(names("a.css", `c: ${f};`)).toEqual(["colour function"]);
  });
  it("flags named colours in style values", () => {
    expect(names("a.tsx", 'style={{ color: "white" }}')).toEqual(["named colour"]);
    expect(names("a.tsx", "style={{ background: 'black' }}")).toEqual(["named colour"]);
    expect(names("a.tsx", 'style={{ color: "var(--ui-text)" }}')).toEqual([]);
  });
  it("skips comments by file type", () => {
    expect(names("a.ts", "// color: #fff")).toEqual([]);
    expect(names("a.ts", " * color: #fff")).toEqual([]);
    expect(names("a.css", "/* #fff */")).toEqual([]);
    expect(names("a.css", " * note #fff")).toEqual([]);
    expect(names("a.css", "* { color: #fff }")).toEqual(["raw hex"]);
  });
  it("design-allow needs a reason and only silences colour literals", () => {
    expect(names("a.ts", 'c = "#fff" // design-allow: user data colour')).toEqual([]);
    expect(names("a.ts", 'c = "#fff" // design-allow: x')).toEqual(["raw hex"]);
    expect(names("a.ts", 'c = "#fff" // design-allow:')).toEqual(["raw hex"]);
    expect(names("a.ts", "c = var(--fg) // design-allow: user data colour")).toEqual(["legacy var"]);
    expect(names("a.ts", 'c = "bg-red-500" // design-allow: user data colour')).toEqual(["palette class"]);
  });
});
