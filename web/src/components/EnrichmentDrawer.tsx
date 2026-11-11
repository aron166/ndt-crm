"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { applyProposal } from "@/app/actions/enrichment";
import type { FieldChange, ChangesMap } from "@/app/actions/enrichment";

interface Proposal {
  id: number;
  entityType: string;
  entityId: number;
  entityName: string;
  changes: ChangesMap;
  overallStatus: string;
  rawResponse: string | null;
}

interface Props {
  proposals: Proposal[];
  onClose: () => void;
}

const FIELD_LABELS: Record<string, string> = {
  status: "Státusz", website: "Weboldal", industryCode: "Iparág",
  notes: "Megjegyzés", linkedinUrl: "LinkedIn", address: "Cím", name: "Név",
};

const SOURCE_COLOR: Record<string, string> = {
  nav_api: "var(--ui-success-text)", registry: "var(--ui-info-text)", website_ping: "var(--ui-warning-text)",
  ai_synthesis: "var(--ui-text-link)", heuristic: "var(--ui-text-muted)", email_check: "var(--ui-danger-text)",
};

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? "var(--ui-success)" : pct >= 60 ? "var(--ui-warning)" : "var(--ui-danger)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <div style={{ width: 48, height: 3, background: "var(--ui-border)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 2 }} />
      </div>
      <span style={{ fontSize: 12, color: "var(--ui-text-muted)" }}>{pct}%</span>
    </div>
  );
}

function ProposalCard({ proposal, onApplied }: { proposal: Proposal; onApplied: () => void }) {
  const fields = Object.entries(proposal.changes) as [string, FieldChange][];
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(fields.filter(([, c]) => c.confidence >= 0.7).map(([k]) => k))
  );
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  const debug = (() => {
    try { return proposal.rawResponse ? JSON.parse(proposal.rawResponse) : null; } catch { return null; }
  })();

  if (done) {
    return (
      <div style={{ padding: "12px 16px", background: "var(--ui-surface-muted)", borderRadius: "var(--ui-radius-control)", display: "flex", alignItems: "center", gap: 8 }}>
        <Check size={14} aria-hidden="true" style={{ color: "var(--ui-success-text)" }} />
        <span style={{ fontSize: 14, color: "var(--ui-text-muted)" }}>{proposal.entityName}: alkalmazva</span>
      </div>
    );
  }

  function handleApply() {
    startTransition(async () => {
      await applyProposal(proposal.id, Array.from(selected));
      setDone(true);
      onApplied();
    });
  }

  return (
    <div style={{ background: "var(--ui-surface-muted)", border: "1px solid var(--ui-border)", borderRadius: "var(--ui-radius-surface)", overflow: "hidden" }}>

      {/* Header */}
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--ui-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ui-text)" }}>{proposal.entityName}</span>
          <span style={{ fontSize: 12, color: "var(--ui-text-muted)" }}>
            {proposal.entityType === "company" ? "cég" : "személy"}
          </span>
        </div>
        {fields.length > 0 && (
          <div style={{ display: "flex", gap: 4 }}>
            <Button type="button" variant="outline" size="xs" onClick={() => setSelected(new Set(fields.map(([k]) => k)))}>
              Mind
            </Button>
            <Button type="button" variant="ghost" size="xs" onClick={() => setSelected(new Set())}>
              Egyik sem
            </Button>
          </div>
        )}
      </div>

      {/* No changes */}
      {fields.length === 0 && (
        <div style={{ padding: "12px 16px" }}>
          <div style={{ fontSize: 14, color: "var(--ui-text-muted)", marginBottom: debug?.facts ? 10 : 0 }}>
            Nem találtunk változtatnivalót.
          </div>
          {debug?.facts && (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {(debug.facts as string[]).map((f: string, i: number) => (
                <div key={i} style={{ fontSize: 12, color: "var(--ui-text-muted)", padding: "2px 0", borderBottom: "1px solid var(--ui-border)" }}>
                  {f}
                </div>
              ))}
            </div>
          )}
          {proposal.rawResponse?.startsWith("ERROR:") && (
            <div style={{ fontSize: 12, color: "var(--ui-danger-text)", marginTop: 4 }}>
              {proposal.rawResponse}
            </div>
          )}
        </div>
      )}

      {/* Field list */}
      {fields.length > 0 && (
        <>
          <div>
            {fields.map(([key, change]) => (
              <label key={key} style={{
                display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 16px",
                cursor: "pointer", borderBottom: "1px solid var(--ui-border)",
                background: selected.has(key) ? "var(--ui-hover)" : "transparent",
                transition: "background 0.1s",
              }}>
                <input type="checkbox" checked={selected.has(key)}
                  onChange={() => setSelected(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; })}
                  style={{ marginTop: 3, accentColor: "var(--ui-accent)", cursor: "pointer", flexShrink: 0 }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ui-text-muted)" }}>
                      {FIELD_LABELS[key] ?? key}
                    </span>
                    <span style={{ fontSize: 12, padding: "1px 6px", borderRadius: 3, border: `1px solid ${SOURCE_COLOR[change.source] ?? "var(--ui-border-strong)"}`, color: SOURCE_COLOR[change.source] ?? "var(--ui-text-muted)" }}>
                      {change.source.replace("_", " ")}
                    </span>
                    <ConfidenceBar value={change.confidence} />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 14, color: "var(--ui-text-muted)", textDecoration: "line-through", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {change.current ?? "(üres)"}
                    </span>
                    <span style={{ color: "var(--ui-text-muted)", fontSize: 12 }}>→</span>
                    <span style={{ fontSize: 14, color: "var(--ui-success-text)", fontWeight: 500, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {change.proposed}
                    </span>
                  </div>
                </div>
              </label>
            ))}
          </div>

          {/* Footer */}
          <div style={{ padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, color: "var(--ui-text-muted)" }}>{selected.size}/{fields.length} kiválasztva</span>
            <Button type="button" onClick={handleApply} disabled={isPending || selected.size === 0}>
              {isPending ? "Mentés..." : "Alkalmazás"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

export function EnrichmentDrawer({ proposals, onClose }: Props) {
  const [appliedCount, setAppliedCount] = useState(0);
  const totalWithChanges = proposals.filter(p => Object.keys(p.changes).length > 0).length;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "var(--ui-scrim)", zIndex: 50 }}
      />

      {/* Drawer */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: 480,
        background: "var(--ui-surface-overlay)", borderTopLeftRadius: "var(--ui-radius-surface)", borderBottomLeftRadius: "var(--ui-radius-surface)",
        zIndex: 51, display: "flex", flexDirection: "column",
        boxShadow: "var(--ui-shadow-overlay)",
        animation: "slideInRight 0.2s ease-out",
      }}>

        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--ui-border)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "var(--ui-text)", display: "flex", alignItems: "center", gap: 8 }}>
              <Sparkles size={16} aria-hidden="true" style={{ color: "var(--ui-text-link)" }} /> Enrichment eredmények
            </div>
            <div style={{ fontSize: 12, color: "var(--ui-text-muted)", marginTop: 2 }}>
              {totalWithChanges} javasolt változtatás · {appliedCount} alkalmazva
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Link href="/enrichment" style={{ fontSize: 12, color: "var(--ui-text-link)", textDecoration: "none" }}>
              Összes futtatás →
            </Link>
            <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Bezárás" /* PROPOSAL copy */>
              <X aria-hidden="true" />
            </Button>
          </div>
        </div>

        {/* Proposals list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: 10 }}>
          {proposals.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "var(--ui-text-muted)", fontSize: 14 }}>
              Nincs eredmény.
            </div>
          ) : proposals.map(p => (
            <ProposalCard key={p.id} proposal={p} onApplied={() => setAppliedCount(c => c + 1)} />
          ))}
        </div>
      </div>
    </>
  );
}
