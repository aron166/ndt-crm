import { describe, it, expect, vi } from "vitest";

const { db } = vi.hoisted(() => ({ db: { suppression: { findMany: vi.fn() } } }));
vi.mock("@/lib/db", () => ({ db }));

import { isAddressSuppressed } from "./index";

describe("loadSuppressionSet folding", () => {
  it("a stored N.Ame@Gmail.com blocks name+x@gmail.com", async () => {
    db.suppression.findMany.mockResolvedValue([{ email: "N.Ame@Gmail.com", domain: null }]);
    expect(await isAddressSuppressed(1, "name+x@gmail.com")).toBe(true);
    expect(await isAddressSuppressed(1, "other@gmail.com")).toBe(false);
  });
});
