import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Regression guard: `backdrop-blur` and the enter/exit animations were
// deliberately dropped from the dialog overlay/popup because they cost
// ~32 ms of INP on "leads: outcome modal open" (104 -> 72 ms, N=7). See
// docs/PERF_2026-09-08_INP.md ("What shipped", item 2). Do not re-add a
// blur or fade here without re-measuring.
const dialogSource = fs.readFileSync(
  path.resolve(__dirname, "../../components/ui/dialog.tsx"),
  "utf-8",
);

describe("dialog.tsx perf regression guard", () => {
  it("does not reintroduce backdrop-blur or the enter/exit animation classes", () => {
    for (const forbidden of [
      "backdrop-blur",
      "animate-in",
      "animate-out",
      "fade-in",
      "fade-out",
      "zoom-in",
      "zoom-out",
    ]) {
      expect(dialogSource).not.toContain(forbidden);
    }
  });
});
