export const DIFF_FIELDS = [
  "vatNumber", "status", "accountType", "city", "county", "zipCode", "address",
  "country", "website", "warmth", "linkedinUrl", "teaorCode", "industryCode",
] as const;
export type DiffField = (typeof DIFF_FIELDS)[number];
export interface FieldDiff { field: string; crm: string | null; file: string }

const norm = (v: string | null | undefined) => (v ?? "").trim();

/** Fields the import row provides (non-blank) that differ from the CRM value. Trimmed, case-insensitive. */
export function diffCompany(
  rec: Partial<Record<DiffField, string | null>>,
  existing: Partial<Record<DiffField, string | null>>,
): FieldDiff[] {
  const out: FieldDiff[] = [];
  for (const f of DIFF_FIELDS) {
    const file = norm(rec[f]);
    if (!file) continue;
    const crm = norm(existing[f]);
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
  if (old.includes(block)) return null;
  return old.trim() ? `${old}\n\n${block}` : block;
}

export const budapestToday = () =>
  new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Budapest" });
