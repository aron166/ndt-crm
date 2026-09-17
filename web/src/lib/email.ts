// Pure email helpers (no Next/Supabase imports — used by the proxy too).

/**
 * Canonical form for matching a login email against `users.email`: trimmed,
 * lowercased; for Gmail (gmail.com / googlemail.com) dots and +tags in the local
 * part are dropped, because Gmail delivers `balogh.aron16+x@` and `balogharon16@`
 * to the same mailbox and Áron signs in with both spellings.
 */
export function normalizeEmail(raw: string | null | undefined): string | null {
  const e = raw?.trim().toLowerCase();
  if (!e || !e.includes("@")) return null;
  const [local, domain] = e.split("@");
  if (domain === "gmail.com" || domain === "googlemail.com") {
    return `${local.split("+")[0].replace(/\./g, "")}@gmail.com`;
  }
  return `${local}@${domain}`;
}

