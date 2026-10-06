// Pure suppression matching. No DB import, so pickers, tests and the send
// backstop share one rule.

export interface SuppressionSet {
  emails: Set<string>;
  domains: Set<string>;
}

export function normalizeEmail(v: string): string {
  return v.trim().toLowerCase();
}

/** "a@b.hu" -> "b.hu"; "@b.hu" or "b.hu" -> "b.hu"; anything else -> null. */
export function normalizeDomain(v: string): string | null {
  const d = v.trim().toLowerCase().replace(/^.*@/, "");
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d) ? d : null;
}

/**
 * True when the address itself, or its domain, or any parent domain is on the
 * list: a "ne keressenek minket" from ceg.hu also covers kozpont.ceg.hu.
 * An empty or missing address is never suppressed (it cannot be sent to anyway).
 */
export function isSuppressed(email: string | null | undefined, set: SuppressionSet): boolean {
  if (!email) return false;
  const e = normalizeEmail(email);
  if (!e) return false;
  if (set.emails.has(e)) return true;
  const at = e.lastIndexOf("@");
  if (at < 0) return false;
  const labels = e.slice(at + 1).split(".");
  for (let i = 0; i < labels.length - 1; i++) {
    if (set.domains.has(labels.slice(i).join("."))) return true;
  }
  return false;
}
