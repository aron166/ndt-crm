import { describe, expect, it } from "vitest";
import { slugify, type SlugOpts } from "./slug";

const IN = ["Árvíztűrő Tükörfúrógép", "  Q3: NDT -- Outreach!! ", "", "!!!", "a".repeat(49) + " bcd"];

// Expected values were computed from the pre-merge per-call-site functions.
const CASES: [string, SlugOpts, string[]][] = [
  ["question key", { sep: "_", max: 50, fallback: "kerdes" },
    ["arvizturo_tukorfurogep", "q3_ndt_outreach", "kerdes", "kerdes", "a".repeat(49) + "_"]],
  ["script key", { sep: "_", max: 40, fallback: "" },
    ["arvizturo_tukorfurogep", "q3_ndt_outreach", "", "", "a".repeat(40)]],
  ["status key", { sep: "_", max: 50, fallback: "status" },
    ["arvizturo_tukorfurogep", "q3_ndt_outreach", "status", "status", "a".repeat(49) + "_"]],
  ["campaign key", { sep: "_", max: 120, fallback: "campaign" },
    ["arvizturo_tukorfurogep", "q3_ndt_outreach", "campaign", "campaign", "a".repeat(49) + "_bcd"]],
  ["campaign slug", { sep: "-", fallback: "" },
    ["arvizturo-tukorfurogep", "q3-ndt-outreach", "", "", "a".repeat(49) + "-bcd"]],
  ["audience file", { sep: "-", fallback: "kampany" },
    ["arvizturo-tukorfurogep", "q3-ndt-outreach", "kampany", "kampany", "a".repeat(49) + "-bcd"]],
];

describe("slugify", () => {
  for (const [name, opts, expected] of CASES) {
    it(name, () => expect(IN.map((s) => slugify(s, opts))).toEqual(expected));
  }
});
