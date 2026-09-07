// Feature E2 part 2: turning a campaign's audience (a saved company segment) into
// an exportable list. The CSV builder is pure → unit-testable; the live
// resolution (filters → where → companies) reuses lib/companies/resolve.

/** How many audience rows the campaign detail previews inline. */
export const AUDIENCE_PREVIEW_LIMIT = 25;

/** Hard cap on a CSV export — bounds memory; far above any real single-tenant
 * segment, so it only ever trips on a pathological/unscoped query. */
export const MAX_EXPORT_ROWS = 50_000;

/** The columns an outreach list needs, in order. */
export interface AudienceCompany {
  name: string;
  vatNumber: string | null;
  city: string | null;
  county: string | null;
  website: string | null;
  pipelineStatus: string | null;
  warmth: string | null;
  teaorCode: string | null;
}

const CSV_HEADERS = [
  "Cégnév", "Adószám", "Város", "Megye", "Weboldal", "Pipeline", "Hőfok", "TEÁOR",
] as const;

/** RFC-4180-ish escape with spreadsheet-formula-injection guard. */
function csvCell(value: string | null | undefined): string {
  const raw = value ?? "";
  // A leading =,+,-,@ (or tab/CR) can be evaluated as a formula when the CSV is
  // opened in Excel/Sheets. Company names come from external data — prefix with
  // an apostrophe so the cell is always treated as literal text.
  const s = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Build a CSV (with header row) for an audience company list. */
export function companiesToCsv(rows: AudienceCompany[]): string {
  const lines = [CSV_HEADERS.join(",")];
  for (const r of rows) {
    lines.push([
      r.name, r.vatNumber, r.city, r.county, r.website,
      r.pipelineStatus, r.warmth, r.teaorCode,
    ].map(csvCell).join(","));
  }
  // CRLF line breaks — Excel (the user's reality) is happiest with them.
  return lines.join("\r\n");
}

/** Safe ASCII-ish filename slug for the CSV download. */
export function audienceFileName(campaignName: string): string {
  const slug = campaignName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "kampany";
  return `${slug}-celkozonseg.csv`;
}
