// Shared normalization for import matching. Ported from the proven
// `etl/src/seed-birdsview-targets.ts` so the in-app importer dedups identically:
// accent/case/punctuation-insensitive names, legal-suffix-insensitive company
// matching, VAT as the strong key (decisions.md #6).

/** Accent-stripped, lowercased, punctuation-collapsed form for fuzzy name matching. */
export function normalizeName(s: string | null | undefined): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const LEGAL_SUFFIXES = new Set([
  "zrt", "kft", "nyrt", "kkt", "bt", "nonprofit", "kozhasznu", "csoport",
  "holding", "group", "kozhasznu", "ev", "kht", "rt",
]);

/** Drop trailing legal-form words (kft, zrt…) so "Acme Kft." matches "Acme". */
export function stripLegalSuffix(norm: string): string {
  let words = norm.split(" ").filter(Boolean);
  while (words.length > 1 && LEGAL_SUFFIXES.has(words[words.length - 1])) {
    words = words.slice(0, -1);
  }
  return words.join(" ");
}

/** Hungarian VAT reduced to its 8-digit core (the part that identifies the entity). */
export function normalizeVat(raw: string | null | undefined): string | null {
  const digits = (raw || "").replace(/\D/g, "");
  if (digits.length < 8) return null;
  return digits.slice(0, 8);
}

/** Coerce a bare domain or full URL to a canonical `https://host` form, or null. */
export function normalizeWebsite(raw: string | null | undefined): string | null {
  let s = (raw || "").trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  try {
    const u = new URL(s);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

/**
 * Split a single full-name cell into first/last. Hungarian convention is
 * "Vezetéknév Keresztnév" (last name first), so the first token is the last
 * name and the remainder the given name(s). Best-effort — separate columns are
 * preferred when available.
 */
export function splitFullName(full: string | null | undefined): {
  firstName: string | null;
  lastName: string | null;
} {
  const parts = (full || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: null, lastName: null };
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return { firstName: parts.slice(1).join(" "), lastName: parts[0] };
}

/** A company status string mapped to our enum, flagging dissolved entities. */
export function normalizeCompanyStatus(raw: string | null | undefined): {
  status: string;
  dissolved: boolean;
} {
  const s = normalizeName(raw);
  if (!s) return { status: "active", dissolved: false };
  if (s.includes("f a") || s.includes("felszamol") || s === "fa") {
    return { status: "F.A.", dissolved: true };
  }
  if (s.includes("inaktiv") || s.includes("inactive") || s.includes("megszunt")) {
    return { status: "inactive", dissolved: true };
  }
  return { status: "active", dissolved: false };
}
