import { describe, it, expect, vi, beforeEach } from "vitest";

const tenantFindUnique = vi.fn();
vi.mock("@/lib/db", () => ({ db: { tenant: { findUnique: (...args: unknown[]) => tenantFindUnique(...args) } } }));

const getLive = vi.fn();
vi.mock("@/lib/content/service", () => ({ getLive: (...args: unknown[]) => getLive(...args) }));

import { getScriptVariants, getRawScriptVariants } from "./queries";
import { parseScriptBlocks, formatScriptBlocks, type ScriptVariant } from "./scripts";

const ok = (r: ScriptVariant[] | { error: string }) => {
  if ("error" in r) throw new Error(`expected variants, got: ${r.error}`);
  return r;
};

describe("getScriptVariants", () => {
  beforeEach(() => {
    tenantFindUnique.mockReset();
    getLive.mockReset();
  });

  it("a variant with a live content item gets the live body, ignoring the stored inline body", async () => {
    tenantFindUnique.mockResolvedValue({
      settings: { scriptVariants: [{ key: "a", label: "A", body: "stale inline", contentItemId: 1 }] },
    });
    getLive.mockResolvedValue([{ id: 1, version: { body: "friss élő szöveg" } }]);
    const variants = await getScriptVariants(1);
    expect(variants).toEqual([{ key: "a", label: "A", body: "friss élő szöveg", contentItemId: 1 }]);
  });

  it("a variant whose content item has no live version never falls back to the inline body", async () => {
    tenantFindUnique.mockResolvedValue({
      settings: { scriptVariants: [{ key: "a", label: "A", body: "stale inline", contentItemId: 2 }] },
    });
    getLive.mockResolvedValue([]); // not live / doesn't exist
    const variants = await getScriptVariants(1);
    expect(variants).toEqual([{ key: "a", label: "A", body: "", contentItemId: 2, liveMissing: true }]);
  });

  it("a variant without contentItemId is unchanged and never calls getLive", async () => {
    tenantFindUnique.mockResolvedValue({
      settings: { scriptVariants: [{ key: "a", label: "A", body: "plain" }] },
    });
    const variants = await getScriptVariants(1);
    expect(variants).toEqual([{ key: "a", label: "A", body: "plain" }]);
    expect(getLive).not.toHaveBeenCalled();
  });
});

describe("getRawScriptVariants", () => {
  beforeEach(() => {
    tenantFindUnique.mockReset();
    getLive.mockReset();
  });

  it("never calls getLive — /leads/setup edits the stored variants, not the live-resolved ones", async () => {
    tenantFindUnique.mockResolvedValue({
      settings: { scriptVariants: [{ key: "a", label: "A", body: "stored body", contentItemId: 2 }] },
    });
    const variants = await getRawScriptVariants(1);
    expect(variants).toEqual([{ key: "a", label: "A", body: "stored body", contentItemId: 2 }]);
    expect(getLive).not.toHaveBeenCalled();
  });

  it("round-tripping the raw list through the editor's format/parse keeps a linked variant's stored body and contentItemId even though its live item is missing (getLive is never consulted here)", async () => {
    tenantFindUnique.mockResolvedValue({
      settings: { scriptVariants: [{ key: "a", label: "A", body: "stored fallback body", contentItemId: 99 }] },
    });
    const raw = await getRawScriptVariants(1);
    const roundTripped = ok(parseScriptBlocks(formatScriptBlocks(raw)));
    expect(roundTripped).toEqual(raw);
    expect(roundTripped[0]).toMatchObject({ body: "stored fallback body", contentItemId: 99 });
    expect(getLive).not.toHaveBeenCalled();
  });
});
