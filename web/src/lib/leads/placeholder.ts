// Seed data ships script texts that start with "TODO". Read-only views show a neutral line instead.
// Hungarian copy is PROPOSAL until Áron approves.
export const SCRIPT_MISSING_TEXT = "Script még nincs megadva";

export function isPlaceholderText(s: string | null | undefined): boolean {
  return /^todo/i.test((s ?? "").trim());
}

export function displayScriptText(s: string | null | undefined): string {
  return isPlaceholderText(s) ? SCRIPT_MISSING_TEXT : (s ?? "");
}
