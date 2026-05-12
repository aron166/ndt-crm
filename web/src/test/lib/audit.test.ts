import { describe, it, expect } from "vitest";
import { diff } from "@/lib/audit";

describe("diff", () => {
  it("returns empty diffs for identical objects", () => {
    const result = diff({ title: "foo", status: "created" }, { title: "foo", status: "created" });
    expect(result.before).toEqual({});
    expect(result.after).toEqual({});
  });

  it("returns only changed fields", () => {
    const result = diff(
      { title: "old", status: "created", type: "call" },
      { title: "new", status: "in_progress", type: "call" }
    );
    expect(result.before).toEqual({ title: "old", status: "created" });
    expect(result.after).toEqual({ title: "new", status: "in_progress" });
  });

  it("ignores updatedAt and createdAt", () => {
    const result = diff(
      { title: "x", updatedAt: "2026-01-01", createdAt: "2026-01-01" },
      { title: "x", updatedAt: "2026-05-12", createdAt: "2026-01-01" }
    );
    expect(result.before).toEqual({});
    expect(result.after).toEqual({});
  });

  it("handles null vs value transitions", () => {
    const result = diff({ dueDate: null }, { dueDate: "2026-06-01" });
    expect(result.before).toEqual({ dueDate: null });
    expect(result.after).toEqual({ dueDate: "2026-06-01" });
  });

  it("detects new fields in after", () => {
    const result = diff({ title: "x" }, { title: "x", description: "added" });
    expect(result.after).toEqual({ description: "added" });
  });
});
