import { interactionTypeLabel, interactionDirectionLabel } from "@/lib/interactions";
import { AUTO_OUTCOME_LABELS, isAutoOutcome } from "@/lib/calls/auto-outcome";
import { callTypeLabel, callOutcomeLabel } from "@/lib/leads/outcomes";
import { formatDateTime } from "@/lib/utils";
import s from "./lead.module.css";

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
    return <p className={s.closedNote}>Még nincs hívás. A fenti eredmény-gombokkal rögzítheted az elsőt.</p>;
  }
  return (
    <>
      {callTypeCounts.length > 0 && (
        <p className={s.muted}>
          {/* PROPOSAL copy */}
          {callTypeCounts.map((c) => `${c.callType ? callTypeLabel(c.callType) : "típus nélkül"}: ${c.count}`).join(" · ")}
        </p>
      )}
      <div className={s.list}>
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
              <div key={r.id} className={s.callItem}>
                <div className={s.dot} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className={s.row}>
                    <span style={{ fontWeight: 600 }}>{interactionTypeLabel(r.type)}</span>
                    {r.direction && <span className={s.muted}>· {interactionDirectionLabel(r.direction)}</span>}
                    {r.outcome && <span className={s.chip}>{outcomeChipLabel(r.outcome)}</span>}
                    {r.user?.name && <span className={s.muted}>· {r.user.name}</span>}
                    <span className={s.rowEnd}>{formatDateTime(r.occurredAt)}</span>
                  </div>
                  {auto && (
                    <div className={s.row}>
                      <span className={`${s.chip} ${s.chipAuto}`}>{AUTO_OUTCOME_LABELS.autoBadge}</span>
                      <span className={s.muted} style={{ fontSize: 12 }}>
                        {AUTO_OUTCOME_LABELS.autoBadgeHint.replace("{pct}", String(confidencePct))}
                      </span>
                      <button type="button" onClick={() => onCorrect(r.id)} disabled={closed} className={s.linkBtn}>
                        {AUTO_OUTCOME_LABELS.correct}
                      </button>
                    </div>
                  )}
                  {r.notes && <p className={s.note}>{r.notes}</p>}
                </div>
              </div>
            );
          })}
      </div>
    </>
  );
}
