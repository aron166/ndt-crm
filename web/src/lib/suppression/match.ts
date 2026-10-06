// Pure suppression matching. No DB import, so pickers, tests and the send
// backstop share one rule.

export interface SuppressionSet {
  emails: Set<string>;
  domains: Set<string>;
}

/** Pasted junk off an address: "Név <A@b.hu>", "mailto:a@b.hu", "a@b.hu;", "a@b.hu.". */
function clean(v: string): string {
  let s = v.trim();
  const angle = s.match(/<([^<>]*)>/);
  if (angle) s = angle[1].trim();
  return s.replace(/^mailto:/i, "").replace(/[;,.\s]+$/, "").toLowerCase();
}

export function normalizeEmail(v: string): string {
  const s = clean(v);
  const at = s.lastIndexOf("@");
  return at < 0 ? s : s.slice(0, at + 1) + s.slice(at + 1).replace(/\.+$/, "");
}

/** "a@b.hu" -> "b.hu"; "@b.hu" or "b.hu" -> "b.hu"; anything else -> null. */
export function normalizeDomain(v: string): string | null {
  const d = clean(v).replace(/^.*@/, "").replace(/\.+$/, "");
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
  const at = e.lastIndexOf("@");
  if (set.emails.has(e)) return true;
  if (at < 0) return false;
  // "a+tag@d" is the same mailbox as "a@d".
  const plus = e.indexOf("+");
  if (plus > 0 && plus < at && set.emails.has(e.slice(0, plus) + e.slice(at))) return true;
  const labels = e.slice(at + 1).split(".");
  for (let i = 0; i < labels.length - 1; i++) {
    if (set.domains.has(labels.slice(i).join("."))) return true;
  }
  return false;
}
