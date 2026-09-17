import { describe, it, expect, vi, beforeEach } from "vitest";

const tenantFindUnique = vi.fn();
vi.mock("@/lib/db", () => ({ db: { tenant: { findUnique: (...args: unknown[]) => tenantFindUnique(...args) } } }));

const getLive = vi.fn();
vi.mock("@/lib/content/service", () => ({ getLive: (...args: unknown[]) => getLive(...args) }));

import { getScriptVariants } from "./queries";

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
