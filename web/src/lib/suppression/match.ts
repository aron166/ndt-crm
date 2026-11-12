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

/**
 * Folded form for suppression compares, so "name+x@gmail.com" and "n.a.m.e@gmail.com"
 * cannot dodge a suppression of "name@gmail.com". "+tag" goes everywhere; dots only on Gmail.
 */
export function suppressionKey(v: string): string {
  const e = normalizeEmail(v);
  const at = e.lastIndexOf("@");
  if (at < 0) return e;
  let local = e.slice(0, at);
  let domain = e.slice(at + 1);
  const plus = local.indexOf("+");
  if (plus > 0) local = local.slice(0, plus);
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") local = local.replace(/\./g, "");
  return local + "@" + domain;
}

/** "a@b.hu" -> "b.hu"; "@b.hu" or "b.hu" -> "b.hu"; anything else -> null. */
export function normalizeDomain(v: string): string | null {
  const d = clean(v).replace(/^.*@/, "").replace(/\.+$/, "");
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d) ? d : null;
}

/**
 * Routes a pasted target: any "@" past the first character means an email, else a domain.
 * Rejects (null) a second address outside "<...>", more than one "@", and whitespace in
 * the address. A leading display name of 2+ letters ("Name info@ceg.hu") is allowed; a
 * stray single letter ("a b@c.hu") is not.
 */
export function parseSuppressionTarget(input: string): { email: string } | { domain: string } | null {
  let s = input.trim();
  const angle = s.match(/<([^<>]*)>/);
  if (angle) {
    if (s.replace(angle[0], "").includes("@")) return null;
    s = angle[1];
  } else {
    const tokens = s.split(/\s+/);
    const last = tokens.pop() ?? "";
    if (tokens.length && (!last.includes("@") || !tokens.every((t) => /^\p{L}{2,}\.?$/u.test(t)))) return null;
    s = last;
  }
  s = clean(s);
  if (/\s/.test(s) || s.split("@").length > 2) return null;
  if (s.indexOf("@") > 0) {
    const email = normalizeEmail(s);
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? { email } : null;
  }
  const domain = normalizeDomain(s);
  return domain ? { domain } : null;
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
  if (set.emails.has(suppressionKey(e))) return true;
  if (at < 0) return false;
  const labels = e.slice(at + 1).split(".");
  for (let i = 0; i < labels.length - 1; i++) {
    if (set.domains.has(labels.slice(i).join("."))) return true;
  }
  return false;
}
