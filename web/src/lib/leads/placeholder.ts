// Seed data ships script texts that start with "TODO". Read-only views show a neutral line instead.
// Hungarian copy is PROPOSAL until Áron approves.
export const SCRIPT_MISSING_TEXT = "Script még nincs megadva";

export function isPlaceholderText(s: string | null | undefined): boolean {
  return /^todo/i.test((s ?? "").trim());
}

export function displayScriptText(s: string | null | undefined): string {
  return isPlaceholderText(s) ? SCRIPT_MISSING_TEXT : (s ?? "");
}

// Option labels: strip only the TODO prefix so "A változat" / "B változat" stay distinguishable.
export function displayScriptLabel(s: string | null | undefined): string {
  const t = s ?? "";
  if (!isPlaceholderText(t)) return t;
  return t.trim().replace(/^todo:?\s*/i, "").trim() || SCRIPT_MISSING_TEXT;
}
