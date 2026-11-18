// CSV of a campaign's queued members for a cold-mail tool (Smartlead / Instantly column names). Leaf file: imports nothing.
export const EXPORT_COLUMNS = ["email", "first_name", "last_name", "company_name", "opener", "segment", "tender", "source_url"] as const;
export interface ExportMember { email: string; firstName: string | null; lastName: string | null; company: string; why: string | null; segment: string | null; contactSource: string | null; source: string | null }

const URL_RE = /https?:\/\/[^\s"']+/;
// A member load with no person name stores "-" (service.addMembers): a company mailbox, so the tool gets an empty name.
const name = (v: string | null) => (v == null || v.trim() === "-" ? "" : v.trim());

export function exportRow(m: ExportMember): Record<(typeof EXPORT_COLUMNS)[number], string> {
  const tag = /^\[(high|mid)\] /.exec(m.why ?? "");
  return {
    email: m.email,
    first_name: name(m.firstName),
    last_name: name(m.lastName),
    company_name: m.company,
    opener: tag ? m.why!.slice(tag[0].length).trim() : "",
    segment: m.segment ?? "",
    tender: tag ? tag[1] : "",
    source_url: URL_RE.exec(m.contactSource ?? "")?.[0] ?? URL_RE.exec(m.source ?? "")?.[0] ?? "",
  };
}

function cell(v: string): string {
  let c = v.slice(0, 2000);
  if (/^[=+\-@\t\r]/.test(c)) c = "'" + c;
  return /[",\r\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c;
}

export function toCsv(members: readonly ExportMember[]): string {
  const lines = [EXPORT_COLUMNS.join(",")];
  for (const m of members) { const r = exportRow(m); lines.push(EXPORT_COLUMNS.map((c) => cell(r[c])).join(",")); }
  return "﻿" + lines.join("\r\n") + "\r\n";
}
