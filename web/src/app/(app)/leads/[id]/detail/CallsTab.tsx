import { interactionTypeLabel, interactionDirectionLabel } from "@/lib/interactions";
import { AUTO_OUTCOME_LABELS, isAutoOutcome } from "@/lib/calls/auto-outcome";
import { callTypeLabel, callOutcomeLabel } from "@/lib/leads/outcomes";
import { formatDateTime } from "@/lib/utils";

export interface Interaction {
  id: number;
  type: string | null;
  direction: string | null;
  notes: string | null;
  outcome: string | null;
  occurredAt: string | Date;
  leadId?: number | null;
  person: { id: number; firstName: string | null; lastName: string | null } | null;
  user?: { name: string } | null;
  autoConfidence: number | null;
  supersedesInteractionId?: number | null;
}

// ⚠️ HU string below is a PROPOSAL, unreviewed by Áron (same convention as
// AUTO_OUTCOME_LABELS in lib/calls/auto-outcome.ts). `outcome: "transcribed"`
// marks a queued dictation, not a real call outcome: it has no entry in
// CALL_OUTCOMES, so the raw English key must never reach the chip.
const TRANSCRIBED_OUTCOME_LABEL = "Átirat rögzítve";
function outcomeChipLabel(outcome: string): string {
  return outcome === "transcribed" ? TRANSCRIBED_OUTCOME_LABEL : callOutcomeLabel(outcome);
}

export function CallsTab({
  leadId, interactions, callTypeCounts, closed, onCorrect,
}: {
  leadId: number;
  interactions: Interaction[];
  callTypeCounts: { callType: string | null; count: number }[];
  closed: boolean;
  onCorrect: (interactionId: number) => void;
}) {
  if (interactions.length === 0) {
    // PROPOSAL copy
    return <div style={{ fontSize: 14, color: "var(--fg-mute)", padding: "8px 0" }}>Még nincs hívás. A Hívás eredménye gombbal rögzítheted az elsőt.</div>;
  }
  return (
    <div className="panel">
      <div className="panel-head"><div className="panel-title">Hívások és interakciók · {interactions.length}</div></div>
      <div className="panel-pad">
        {callTypeCounts.length > 0 && (
          <p className="page-sub" style={{ marginBottom: 12 }}>
            {/* PROPOSAL copy */}
            {callTypeCounts.map((c) => `${c.callType ? callTypeLabel(c.callType) : "típus nélkül"}: ${c.count}`).join(" · ")}
          </p>
        )}
        <div className="space-y-3">
          {interactions.map((r) => {
            // A correction (supersedesInteractionId set) is never itself flagged
            // as auto-derived: it IS the human correction. And the badge/button
            // only ever apply to an interaction that actually belongs to the lead
            // being viewed: the timeline query also pulls in sibling leads of the
            // same company/person, and correcting THOSE would silently act on a
            // different lead than the one shown in the modal.
            const ownLead = r.leadId === leadId;
            // NOT gated on supersedesInteractionId: an applied parse
            // that answered a dictated transcript supersedes that
            // transcript, and it is exactly the flow the badge exists
            // for. isAutoOutcome already excludes a human correction,
            // which never carries a confidence.
            const auto = ownLead && isAutoOutcome(r);
            const confidencePct = auto ? Math.round((r.autoConfidence ?? 0) * 100) : null;
            return (
              <div key={r.id} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--indigo)", marginTop: 5, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="flex items-center gap-2 flex-wrap" style={{ fontSize: 12, marginBottom: 2 }}>
                    <span style={{ color: "var(--fg)", fontWeight: 500 }}>{interactionTypeLabel(r.type)}</span>
                    {r.direction && <span style={{ color: "var(--fg-mute)" }}>· {interactionDirectionLabel(r.direction)}</span>}
                    {r.outcome && (
                      <span className="font-mono-ndt" style={{ fontSize: 12, padding: "1px 6px", borderRadius: 10, background: "var(--bg-hover)", color: "var(--fg-soft)" }}>
                        {outcomeChipLabel(r.outcome)}
                      </span>
                    )}
                    {r.user?.name && <span style={{ color: "var(--fg-faint)", fontSize: 12 }}>· {r.user.name}</span>}
                    <span className="font-mono-ndt" style={{ color: "var(--fg-faint)", fontSize: 12, marginLeft: "auto" }}>{formatDateTime(r.occurredAt)}</span>
                  </div>
                  {auto && (
                    <div className="flex items-center gap-2" style={{ marginBottom: 2, flexWrap: "wrap" }}>
                      <span className="font-mono-ndt" style={{ fontSize: 11, fontWeight: 600, padding: "1px 6px", borderRadius: 10, background: "var(--amber-soft)", color: "var(--amber)" }}>
                        {AUTO_OUTCOME_LABELS.autoBadge}
                      </span>
                      <span style={{ fontSize: 11, color: "var(--fg-mute)" }}>
                        {AUTO_OUTCOME_LABELS.autoBadgeHint.replace("{pct}", String(confidencePct))}
                      </span>
                      <button
                        onClick={() => onCorrect(r.id)}
                        disabled={closed}
                        className="min-h-[44px]"
                        style={{ background: "none", border: "none", color: "var(--indigo)", fontSize: 11, fontWeight: 600, padding: 0, cursor: "pointer" }}
                      >
                        {AUTO_OUTCOME_LABELS.correct}
                      </button>
                    </div>
                  )}
                  {r.notes && <p style={{ fontSize: 12, color: "var(--fg-soft)", lineHeight: 1.4 }}>{r.notes}</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
