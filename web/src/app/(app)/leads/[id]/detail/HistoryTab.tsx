import { lostReasonLabel } from "@/lib/leads/lifecycle";
import { LEAD_OUTCOME_LABEL, type LeadOutcome } from "@/lib/leads/outcomes";
import { formatRelativeTime } from "@/lib/utils";
import s from "./lead.module.css";

export interface AuditEntry {
  id: number;
  action: string;
  occurredAt: string | Date;
  changes: unknown;
}

const MARKETING_KEYS = [
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
  "referrer", "landing_variant", "lead_score", "priority",
];

// Source details and audit; empty fields and an empty audit are not listed.
export function HistoryTab({
  sourceApp, source, campaign, outcome, lostReason, customFields, auditEntries,
}: {
  sourceApp: string | null;
  source: string | null;
  campaign: string | null;
  outcome: string;
  lostReason: string | null;
  customFields: Record<string, unknown> | null;
  auditEntries: AuditEntry[];
}) {
  const cf = customFields ?? {};
  const rows: [string, string, boolean][] = [
    ["App", sourceApp ?? "", false],
    ["Csatorna", source ?? "", false],
    ["Kampány", campaign ?? "", false],
    ["Kimenetel", outcome === "open" ? "" : `${LEAD_OUTCOME_LABEL[outcome as LeadOutcome] ?? outcome}${outcome === "lost" && lostReason ? ` · ${lostReasonLabel(lostReason)}` : ""}`, false],
    ...MARKETING_KEYS.map((k): [string, string, boolean] => [k, cf[k] == null ? "" : String(cf[k]), true]),
  ];
  const shown = rows.filter(([, v]) => v !== "");

  if (shown.length === 0 && auditEntries.length === 0) {
    // PROPOSAL copy
    return <p className={s.closedNote}>Még nincs előzmény. A lead módosításai itt jelennek meg.</p>;
  }
  return (
    <>
      {shown.length > 0 && (
        <div className={s.list}>
          <h3 className={s.h3}>Forrás</h3>
          {shown.map(([k, v]) => (
            <div key={k} className={s.kv}><span>{k}</span><span>{v}</span></div>
          ))}
        </div>
      )}
      {auditEntries.length > 0 && (
        <div className={s.list}>
          {/* PROPOSAL copy */}
          <h3 className={s.h3}>Módosítások</h3>
          {auditEntries.slice(0, 12).map((a) => (
            <div key={a.id} className={s.kv}><span>{a.action}</span><span>{formatRelativeTime(a.occurredAt)}</span></div>
          ))}
        </div>
      )}
    </>
  );
}
