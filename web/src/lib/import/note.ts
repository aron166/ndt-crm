import { normalizeVat, normalizeWebsite } from "./normalize";

export const DIFF_FIELDS = [
  "vatNumber", "status", "accountType", "city", "county", "zipCode", "address",
  "country", "website", "warmth", "linkedinUrl", "teaorCode", "industryCode",
] as const;
export type DiffField = (typeof DIFF_FIELDS)[number];
export interface FieldDiff { field: string; crm: string | null; file: string }

const norm = (v: string | null | undefined) => (v ?? "").trim();

const SIDE_NORM: Partial<Record<DiffField, (v: string | null) => string | null>> = {
  vatNumber: normalizeVat, website: normalizeWebsite,
};

/**
 * Fields the import row provides (non-blank) that differ from the CRM value. Trimmed, case-insensitive;
 * VAT and website are normalized on both sides. When `provided` (raw mapped values) is given, only
 * fields with a non-blank raw value are compared (builder defaults must not invent diffs).
 */
export function diffCompany(
  rec: Partial<Record<DiffField, string | null>>,
  existing: Partial<Record<DiffField, string | null>>,
  provided?: Record<string, string | undefined>,
): FieldDiff[] {
  const out: FieldDiff[] = [];
  for (const f of DIFF_FIELDS) {
    if (provided && !norm(provided[f])) continue;
    const n = SIDE_NORM[f];
    const file = norm(n ? n(rec[f] ?? null) : rec[f]);
    if (!file) continue;
    const crm = norm(n ? n(existing[f] ?? null) : existing[f]);
    if (crm.toLowerCase() !== file.toLowerCase()) out.push({ field: f, crm: crm || null, file });
  }
  return out;
}

/** The note block, or null when there is nothing to add. */
export function buildImportNote(a: {
  fileName: string; date: string; diffs: FieldDiff[]; rowNotes?: string | null;
}): string | null {
  const notes = norm(a.rowNotes);
  if (a.diffs.length === 0 && !notes) return null;
  let head = `[Import ${a.date}, ${a.fileName}]`;
  if (a.diffs.length) {
    head += " Eltérő mezők: " + a.diffs.map((d) => `${d.field} (CRM: ${d.crm ?? "-"}, fájl: ${d.file})`).join("; ");
  }
  return notes ? `${head}\nMegjegyzés a fájlból: ${notes}` : head;
}

/** Appends block to existing notes; null when the exact block is already there (idempotent). */
export function appendImportNote(existing: string | null | undefined, block: string): string | null {
  const old = existing ?? "";
  // idempotent across days: compare with the "[Import YYYY-MM-DD, " date stripped
  const strip = (t: string) => t.replace(/\[Import \d{4}-\d{2}-\d{2}, /g, "[Import ");
  if (strip(old).includes(strip(block))) return null;
  return old.trim() ? `${old}\n\n${block}` : block;
}

export const budapestToday = () =>
  new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Budapest" });
