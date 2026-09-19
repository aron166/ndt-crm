import { describe, it, expect } from "vitest";
import { shouldRefresh, hasUnsavedInput, REFRESH_MIN_INTERVAL_MS } from "./RefreshOnFocus";

describe("shouldRefresh", () => {
  it("is false when not visible, even past the throttle window", () => {
    expect(shouldRefresh(0, REFRESH_MIN_INTERVAL_MS + 1000, false)).toBe(false);
  });

  it("is false inside the throttle window", () => {
    expect(shouldRefresh(1000, 1000 + REFRESH_MIN_INTERVAL_MS - 1, true)).toBe(false);
  });

  it("is true once visible and the window has elapsed", () => {
    expect(shouldRefresh(1000, 1000 + REFRESH_MIN_INTERVAL_MS + 1, true)).toBe(true);
  });

  it("is true exactly at the boundary (comparison is >=)", () => {
    expect(shouldRefresh(1000, 1000 + REFRESH_MIN_INTERVAL_MS, true)).toBe(true);
  });
});

describe("hasUnsavedInput", () => {
  it("is false for a document with no textarea", () => {
    document.body.innerHTML = `<div>nothing here</div>`;
    expect(hasUnsavedInput(document)).toBe(false);
  });

  it("is false for a textarea with an empty value", () => {
    document.body.innerHTML = `<textarea></textarea>`;
    expect(hasUnsavedInput(document)).toBe(false);
  });

  it("is false for a textarea with a whitespace-only value", () => {
    document.body.innerHTML = `<textarea></textarea>`;
    (document.querySelector("textarea") as HTMLTextAreaElement).value = "   \n  ";
    expect(hasUnsavedInput(document)).toBe(false);
  });

  it("is true for a textarea with real text", () => {
    document.body.innerHTML = `<textarea></textarea>`;
    (document.querySelector("textarea") as HTMLTextAreaElement).value = "hello";
    expect(hasUnsavedInput(document)).toBe(true);
  });

  it("is true when a (even empty) textarea is focused", () => {
    document.body.innerHTML = `<textarea></textarea>`;
    (document.querySelector("textarea") as HTMLTextAreaElement).focus();
    expect(hasUnsavedInput(document)).toBe(true);
  });

  it("is true when a (even empty) input is focused", () => {
    document.body.innerHTML = `<input type="text" />`;
    (document.querySelector("input") as HTMLInputElement).focus();
    expect(hasUnsavedInput(document)).toBe(true);
  });

  // jsdom does not implement `isContentEditable` (it's always `undefined`,
  // never `true`, even on a focused contenteditable element — a known jsdom
  // gap, not a bug in our code). Faking the getter would test the mock, not
  // the function, so this case is left uncovered here rather than faked.
  it.skip("is true for a focused contenteditable element (jsdom doesn't implement isContentEditable)", () => {
    document.body.innerHTML = `<div contenteditable="true" tabindex="0"></div>`;
    (document.querySelector("[contenteditable]") as HTMLElement).focus();
    expect(hasUnsavedInput(document)).toBe(true);
  });
});
