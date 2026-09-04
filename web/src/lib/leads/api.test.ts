import { describe, it, expect } from "vitest";
import { leadListQuerySchema, leadPatchSchema, leadInteractionWireSchema, toCallOutcomeInput } from "./api";
import { callOutcomeSchema } from "./outcomes";

describe("lead API schemas", () => {
  it("list query defaults + caps page_size", () => {
    const d = leadListQuerySchema.parse({});
    expect(d).toMatchObject({ page: 1, page_size: 25 });
    expect(leadListQuerySchema.safeParse({ page_size: "500" }).success).toBe(false);
    expect(leadListQuerySchema.parse({ status: "recall", assigned_to: "2", page: "3" })).toMatchObject({ status: "recall", assigned_to: 2, page: 3 });
  });
  it("patch rejects empty body + unknown outcome, allows null assignee and custom_fields", () => {
    expect(leadPatchSchema.safeParse({}).success).toBe(false);
    expect(leadPatchSchema.safeParse({ outcome: "maybe" }).success).toBe(false);
    expect(leadPatchSchema.safeParse({ assigned_to_id: null, custom_fields: { a: 1, b: null } }).success).toBe(true);
  });
  it("wire interaction payload maps to the shared modal schema (same rules)", () => {
    const wire = leadInteractionWireSchema.parse({ outcome: "callback_requested", note: "x", callback_at: "2026-09-10T10:00:00Z", assigned_to_id: "2" });
    const r = callOutcomeSchema.safeParse(toCallOutcomeInput(wire));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.assignedToId).toBe(2);
    // no note → the shared rule blocks it, exactly like the UI
    expect(callOutcomeSchema.safeParse(toCallOutcomeInput(leadInteractionWireSchema.parse({ outcome: "no_answer" }))).success).toBe(false);
  });
});
