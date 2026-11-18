// Stub, implemented in the next commit.
export const EXPORT_COLUMNS = ["email", "first_name", "last_name", "company_name", "opener", "segment", "tender", "source_url"] as const;
export interface ExportMember { email: string; firstName: string | null; lastName: string | null; company: string; why: string | null; segment: string | null; contactSource: string | null; source: string | null }
export function exportRow(_m: ExportMember): Record<(typeof EXPORT_COLUMNS)[number], string> {
  return {} as Record<(typeof EXPORT_COLUMNS)[number], string>;
}
export function toCsv(_members: readonly ExportMember[]): string {
  return "";
}
