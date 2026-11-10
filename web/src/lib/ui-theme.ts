export type UiTheme = "glass-light" | "warm-glass";

// Allow-list for the preview-only theme cookie; anything else (or preview off) is the default theme.
export function uiThemeFromCookie(value: string | null | undefined, previewEnabled: boolean): UiTheme | null {
  if (!previewEnabled) return null;
  return value === "glass-light" || value === "warm-glass" ? value : null;
}
