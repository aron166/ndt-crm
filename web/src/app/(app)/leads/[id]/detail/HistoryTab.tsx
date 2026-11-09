import { lostReasonLabel } from "@/lib/leads/lifecycle";
import { LEAD_OUTCOME_LABEL, type LeadOutcome } from "@/lib/leads/outcomes";
import { formatRelativeTime } from "@/lib/utils";

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
    return <div style={{ fontSize: 14, color: "var(--fg-mute)", padding: "8px 0" }}>Még nincs előzmény. A lead módosításai itt jelennek meg.</div>;
  }
  return (
    <div className="space-y-4">
      {shown.length > 0 && (
        <div className="panel">
          <div className="panel-head"><div className="panel-title">Forrás</div></div>
          <div className="panel-pad space-y-2">
            {shown.map(([k, v, mono]) => (
              <div key={k} className="flex justify-between gap-4" style={{ fontSize: 12 }}>
                <span className={mono ? "font-mono-ndt" : undefined} style={{ color: mono ? "var(--fg-faint)" : "var(--fg-mute)" }}>{k}</span>
                <span className="font-mono-ndt" style={{ color: "var(--fg)", textAlign: "right" }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {auditEntries.length > 0 && (
        <div className="panel">
          <div className="panel-head"><div className="panel-title">Előzmények</div></div>
          <div className="panel-pad space-y-2">
            {auditEntries.slice(0, 12).map((a) => (
              <div key={a.id} className="flex items-center justify-between" style={{ fontSize: 12 }}>
                <span className="font-mono-ndt" style={{ color: "var(--fg-mute)" }}>{a.action}</span>
                <span className="font-mono-ndt" style={{ color: "var(--fg-faint)" }}>{formatRelativeTime(a.occurredAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
