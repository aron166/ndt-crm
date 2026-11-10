import { describe, it, expect } from "vitest";
import { parseTheme, DEFAULT_THEME } from "./theme";
import { statusTone, STATUS_TONES } from "@/lib/marketing/types";

// The root layout renders whatever this returns into <html data-theme>, so
// every shape a nullable JSONB column can hand back has to land on a theme
// rather than throw. Dark is the default, and only an explicit "light" leaves
// it — an existing user with no settings must see no change.
describe("parseTheme", () => {
  it("defaults to dark for a user who has never chosen", () => {
    expect(parseTheme(null)).toBe("dark");
    expect(parseTheme(undefined)).toBe("dark");
    expect(parseTheme({})).toBe("dark");
    expect(DEFAULT_THEME).toBe("dark");
  });

  it("reads an explicit light choice", () => {
    expect(parseTheme({ theme: "light" })).toBe("light");
  });

  it("keeps other settings keys out of the way", () => {
    expect(parseTheme({ density: "compact", theme: "light" })).toBe("light");
    expect(parseTheme({ density: "compact" })).toBe("dark");
  });

  it("falls back to dark on anything that is not exactly \"light\"", () => {
    // Case matters: the action only ever writes the lowercase literal.
    expect(parseTheme({ theme: "Light" })).toBe("dark");
    expect(parseTheme({ theme: true })).toBe("dark");
    expect(parseTheme({ theme: null })).toBe("dark");
    expect(parseTheme([])).toBe("dark");
    expect(parseTheme("light")).toBe("dark");
    expect(parseTheme(42)).toBe("dark");
  });
});

describe("statusTone", () => {
  it("keeps a colour only for the meaning states (neutral chips otherwise)", () => {
    expect(STATUS_TONES.rewrite_requested.fg).not.toBe(STATUS_TONES.draft.fg);
    expect(STATUS_TONES.live.fg).not.toBe(STATUS_TONES.draft.fg);
    expect(STATUS_TONES.in_review.fg).toBe(STATUS_TONES.draft.fg);
  });

  it("falls back to the draft tone for an unknown status", () => {
    expect(statusTone("something_new")).toBe(STATUS_TONES.draft);
  });

  it("is tokens only, so it follows the theme", () => {
    for (const tone of Object.values(STATUS_TONES)) {
      expect(tone.fg).toMatch(/^var\(--/);
      expect(tone.bg).toMatch(/^var\(--/);
      expect(tone.line).toMatch(/^var\(--/);
    }
  });
});
