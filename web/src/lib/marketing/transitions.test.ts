import { describe, it, expect } from "vitest";
import { canTransition, assertTransition, InvalidTransitionError } from "./transitions";

describe("content status transitions", () => {
  it("follows the happy path draft → in_review → approved → published", () => {
    expect(canTransition("draft", "in_review")).toBe(true);
    expect(canTransition("in_review", "approved")).toBe(true);
    expect(canTransition("approved", "published")).toBe(true);
    expect(canTransition("approved", "scheduled")).toBe(true);
    expect(canTransition("scheduled", "published")).toBe(true);
  });

  it("allows rejection from any pre-published state", () => {
    expect(canTransition("draft", "rejected")).toBe(true);
    expect(canTransition("in_review", "rejected")).toBe(true);
    expect(canTransition("approved", "rejected")).toBe(true);
    expect(canTransition("scheduled", "rejected")).toBe(true);
  });

  it("allows sending back to draft for re-editing", () => {
    expect(canTransition("in_review", "draft")).toBe(true);
    expect(canTransition("approved", "draft")).toBe(true);
    expect(canTransition("rejected", "draft")).toBe(true);
  });

  it("treats published as terminal", () => {
    expect(canTransition("published", "approved")).toBe(false);
    expect(canTransition("published", "draft")).toBe(false);
    expect(canTransition("published", "rejected")).toBe(false);
  });

  it("rejects no-op and illegal jumps", () => {
    expect(canTransition("draft", "draft")).toBe(false);
    expect(canTransition("draft", "published")).toBe(false);
    expect(canTransition("draft", "approved")).toBe(false);
    expect(canTransition("rejected", "approved")).toBe(false);
  });

  it("assertTransition throws on an illegal move", () => {
    expect(() => assertTransition("published", "draft")).toThrow(InvalidTransitionError);
    expect(() => assertTransition("in_review", "approved")).not.toThrow();
  });
});
