import { describe, it, expect } from "vitest";
import { uiThemeFromCookie } from "./ui-theme";

describe("uiThemeFromCookie", () => {
  it("accepts the two variants only when preview is on", () => {
    expect(uiThemeFromCookie("glass-light", true)).toBe("glass-light");
    expect(uiThemeFromCookie("warm-glass", true)).toBe("warm-glass");
    expect(uiThemeFromCookie("glass-light", false)).toBeNull();
  });
  it("rejects unknown or missing values", () => {
    expect(uiThemeFromCookie("dark", true)).toBeNull();
    expect(uiThemeFromCookie("", true)).toBeNull();
    expect(uiThemeFromCookie(undefined, true)).toBeNull();
    expect(uiThemeFromCookie(null, true)).toBeNull();
  });
});
