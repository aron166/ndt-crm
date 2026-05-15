"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
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
  nav_api: "var(--mint)", registry: "var(--sky)", website_ping: "var(--amber)",
  ai_synthesis: "var(--indigo)", heuristic: "var(--fg-mute)", email_check: "var(--coral)",
};

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? "var(--mint)" : pct >= 60 ? "var(--amber)" : "var(--coral)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <div style={{ width: 48, height: 3, background: "var(--line-soft)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 2 }} />
      </div>
      <span style={{ fontSize: 10, color: "var(--fg-faint)", fontFamily: "var(--font-mono-ndt)" }}>{pct}%</span>
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
      <div style={{ padding: "12px 16px", background: "var(--bg-raised)", borderRadius: 6, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ color: "var(--mint)", fontSize: 14 }}>✓</span>
        <span style={{ fontSize: 13, color: "var(--fg-mute)" }}>{proposal.entityName} — alkalmazva</span>
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
    <div style={{ background: "var(--bg-raised)", border: "1px solid var(--line-soft)", borderRadius: 8, overflow: "hidden" }}>

      {/* Header */}
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--line-soft)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--fg)" }}>{proposal.entityName}</span>
          <span style={{ fontSize: 10, color: "var(--fg-faint)", fontFamily: "var(--font-mono-ndt)", textTransform: "uppercase" }}>
            {proposal.entityType === "company" ? "cég" : "személy"}
          </span>
        </div>
        {fields.length > 0 && (
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={() => setSelected(new Set(fields.map(([k]) => k)))}
              style={{ fontSize: 11, padding: "2px 8px", border: "1px solid var(--mint)", color: "var(--mint)", background: "transparent", borderRadius: 4, cursor: "pointer" }}>
              Mind
            </button>
            <button onClick={() => setSelected(new Set())}
              style={{ fontSize: 11, padding: "2px 8px", border: "1px solid var(--line-soft)", color: "var(--fg-mute)", background: "transparent", borderRadius: 4, cursor: "pointer" }}>
              Egyik sem
            </button>
          </div>
        )}
      </div>

      {/* No changes */}
      {fields.length === 0 && (
        <div style={{ padding: "12px 16px" }}>
          <div style={{ fontSize: 12, color: "var(--fg-faint)", marginBottom: debug?.facts ? 10 : 0 }}>
            Nem találtunk változtatnivalót.
          </div>
          {debug?.facts && (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {(debug.facts as string[]).map((f: string, i: number) => (
                <div key={i} style={{ fontSize: 10, color: "var(--fg-faint)", fontFamily: "var(--font-mono-ndt)", padding: "2px 0", borderBottom: "1px solid var(--line-soft)" }}>
                  {f}
                </div>
              ))}
            </div>
          )}
          {proposal.rawResponse?.startsWith("ERROR:") && (
            <div style={{ fontSize: 11, color: "var(--coral)", fontFamily: "var(--font-mono-ndt)", marginTop: 4 }}>
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
                cursor: "pointer", borderBottom: "1px solid var(--line-soft)",
                background: selected.has(key) ? "oklch(0.66 0.19 278 / 0.07)" : "transparent",
                transition: "background 0.1s",
              }}>
                <input type="checkbox" checked={selected.has(key)}
                  onChange={() => setSelected(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; })}
                  style={{ marginTop: 3, accentColor: "var(--indigo)", cursor: "pointer", flexShrink: 0 }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "var(--fg-mute)", textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "var(--font-mono-ndt)" }}>
                      {FIELD_LABELS[key] ?? key}
                    </span>
                    <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 3, border: `1px solid ${SOURCE_COLOR[change.source] ?? "var(--line)"}`, color: SOURCE_COLOR[change.source] ?? "var(--fg-faint)", fontFamily: "var(--font-mono-ndt)", textTransform: "uppercase" }}>
                      {change.source.replace("_", " ")}
                    </span>
                    <ConfidenceBar value={change.confidence} />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12, color: "var(--fg-faint)", textDecoration: "line-through", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {change.current ?? "(üres)"}
                    </span>
                    <span style={{ color: "var(--fg-faint)", fontSize: 11 }}>→</span>
                    <span style={{ fontSize: 12, color: "var(--mint)", fontWeight: 500, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {change.proposed}
                    </span>
                  </div>
                </div>
              </label>
            ))}
          </div>

          {/* Footer */}
          <div style={{ padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, color: "var(--fg-faint)" }}>{selected.size}/{fields.length} kiválasztva</span>
            <button onClick={handleApply} disabled={isPending || selected.size === 0}
              style={{
                fontSize: 12, fontWeight: 600, padding: "6px 14px",
                background: selected.size > 0 ? "var(--indigo)" : "var(--bg-hover)",
                color: selected.size > 0 ? "white" : "var(--fg-faint)",
                border: "none", borderRadius: 5, cursor: selected.size > 0 ? "pointer" : "not-allowed",
                opacity: isPending ? 0.6 : 1,
              }}>
              {isPending ? "Mentés..." : "Alkalmazás"}
            </button>
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
        style={{ position: "fixed", inset: 0, background: "oklch(0 0 0 / 0.5)", zIndex: 50, backdropFilter: "blur(2px)" }}
      />

      {/* Drawer */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: 480,
        background: "var(--bg-panel)", borderLeft: "1px solid var(--line-soft)",
        zIndex: 51, display: "flex", flexDirection: "column",
        boxShadow: "-20px 0 60px oklch(0 0 0 / 0.4)",
        animation: "slideInRight 0.2s ease-out",
      }}>

        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--line-soft)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--fg)", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: "var(--indigo)" }}>✦</span> Enrichment eredmények
            </div>
            <div style={{ fontSize: 11, color: "var(--fg-faint)", marginTop: 2, fontFamily: "var(--font-mono-ndt)" }}>
              {totalWithChanges} javasolt változtatás · {appliedCount} alkalmazva
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Link href="/enrichment" style={{ fontSize: 11, color: "var(--indigo)", textDecoration: "none" }}>
              Összes futtatás →
            </Link>
            <button onClick={onClose} style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "1px solid var(--line-soft)", borderRadius: 6, color: "var(--fg-mute)", cursor: "pointer", fontSize: 16 }}>
              ×
            </button>
          </div>
        </div>

        {/* Proposals list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: 10 }}>
          {proposals.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "var(--fg-faint)", fontSize: 13 }}>
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
