"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { applyProposal } from "@/app/actions/enrichment";
import { formatRelativeTime } from "@/lib/utils";
import type { FieldChange, ChangesMap } from "@/app/actions/enrichment";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface RunWithCount {
  id: number;
  entityType: string;
  entityIds: number[];
  status: string;
  triggeredBy: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  _count: { proposals: number };
}

interface ProposalWithRun {
  id: number;
  entityType: string;
  entityId: number;
  entityName: string;
  changes: ChangesMap;
  overallStatus: string;
  rawResponse: string | null;
  createdAt: string;
  run: { entityType: string; triggeredBy: string | null };
}

interface Props {
  runs: RunWithCount[];
  proposals: ProposalWithRun[];
}

// ─── Confidence bar ─────────────────────────────────────────────────────────────

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    pct >= 80 ? "var(--mint)" :
    pct >= 60 ? "var(--amber)" :
    "var(--coral)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 60, height: 4, background: "var(--line-soft)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 2, transition: "width 0.3s" }} />
      </div>
      <span style={{ fontSize: 10, color: "var(--fg-mute)", fontFamily: "var(--font-mono-ndt)" }}>{pct}%</span>
    </div>
  );
}

// ─── Source badge ───────────────────────────────────────────────────────────────

function SourceBadge({ source }: { source: string }) {
  const color =
    source === "registry" ? "var(--mint)" :
    source === "inference" ? "var(--indigo)" :
    "var(--fg-faint)";
  return (
    <span style={{
      fontSize: 10, padding: "1px 6px", borderRadius: 3,
      border: `1px solid ${color}`, color, fontFamily: "var(--font-mono-ndt)",
      textTransform: "uppercase", letterSpacing: "0.05em",
    }}>
      {source}
    </span>
  );
}

// ─── Status badge ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    pending:  { label: "Várakozik", color: "var(--amber)" },
    running:  { label: "Fut",       color: "var(--indigo)" },
    done:     { label: "Kész",      color: "var(--mint)" },
    failed:   { label: "Hiba",      color: "var(--coral)" },
    approved: { label: "Jóváhagyta", color: "var(--mint)" },
    rejected: { label: "Elutasítva", color: "var(--fg-faint)" },
    partial:  { label: "Részleges",  color: "var(--amber)" },
  };
  const { label, color } = map[status] ?? { label: status, color: "var(--fg-faint)" };
  return (
    <span style={{ fontSize: 11, color, fontWeight: 600, fontFamily: "var(--font-mono-ndt)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
      {label}
    </span>
  );
}

// ─── Field label mapping ────────────────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  status: "Státusz",
  website: "Weboldal",
  industryCode: "Iparág",
  notes: "Megjegyzés",
  linkedinUrl: "LinkedIn URL",
};

function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key;
}

// ─── Proposal card ──────────────────────────────────────────────────────────────

function ProposalCard({ proposal }: { proposal: ProposalWithRun }) {
  const [selected, setSelected] = useState<Set<string>>(() =>
    new Set(Object.keys(proposal.changes).filter((k) => proposal.changes[k]?.status === "pending"))
  );
  const [isPending, startTransition] = useTransition();
  const [applied, setApplied] = useState(false);

  const fields = Object.entries(proposal.changes) as [string, FieldChange][];
  const entityHref = proposal.entityType === "company"
    ? `/companies/${proposal.entityId}`
    : `/persons/${proposal.entityId}`;

  function toggleField(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function handleApproveAll() {
    setSelected(new Set(fields.map(([k]) => k)));
  }

  function handleRejectAll() {
    setSelected(new Set());
  }

  function handleApply() {
    startTransition(async () => {
      await applyProposal(proposal.id, Array.from(selected));
      setApplied(true);
    });
  }

  if (applied) {
    return (
      <div style={{ padding: "14px 16px", background: "var(--bg-card)", border: "1px solid var(--line-soft)", borderRadius: 6, opacity: 0.5 }}>
        <span style={{ fontSize: 13, color: "var(--fg-mute)" }}>Alkalmazva — {proposal.entityName}</span>
      </div>
    );
  }

  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--line-soft)", borderRadius: 6, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--line-soft)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Link href={entityHref} style={{ fontSize: 14, fontWeight: 600, color: "var(--fg)" }}>
            {proposal.entityName}
          </Link>
          <span style={{ fontSize: 11, color: "var(--fg-faint)", fontFamily: "var(--font-mono-ndt)", textTransform: "uppercase" }}>
            {proposal.entityType === "company" ? "cég" : "személy"}
          </span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={handleApproveAll}
            style={{ fontSize: 12, padding: "3px 8px", border: "1px solid var(--mint)", color: "var(--mint)", background: "transparent", borderRadius: 4, cursor: "pointer" }}
          >
            Mind jóváhagy
          </button>
          <button
            onClick={handleRejectAll}
            style={{ fontSize: 12, padding: "3px 8px", border: "1px solid var(--line-soft)", color: "var(--fg-mute)", background: "transparent", borderRadius: 4, cursor: "pointer" }}
          >
            Mind elutasít
          </button>
        </div>
      </div>

      {/* Fields */}
      <div style={{ padding: "8px 0" }}>
        {fields.map(([key, change]) => (
          <label
            key={key}
            style={{
              display: "flex", alignItems: "flex-start", gap: 10,
              padding: "8px 16px", cursor: "pointer",
              background: selected.has(key) ? "oklch(0.66 0.19 278 / 0.06)" : "transparent",
              transition: "background 0.15s",
            }}
          >
            <input
              type="checkbox"
              checked={selected.has(key)}
              onChange={() => toggleField(key)}
              style={{ marginTop: 2, accentColor: "var(--indigo)", cursor: "pointer" }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--fg-soft)", textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: "var(--font-mono-ndt)" }}>
                  {fieldLabel(key)}
                </span>
                <SourceBadge source={change.source} />
                <ConfidenceBar value={change.confidence} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, color: "var(--fg-mute)", textDecoration: "line-through", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {change.current ?? "(üres)"}
                </span>
                <span style={{ fontSize: 12, color: "var(--fg-faint)" }}>→</span>
                <span style={{ fontSize: 13, color: "var(--mint)", fontWeight: 500, maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {change.proposed}
                </span>
              </div>
            </div>
          </label>
        ))}
      </div>

      {/* Footer */}
      <div style={{ padding: "10px 16px", borderTop: "1px solid var(--line-soft)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 11, color: "var(--fg-faint)" }}>
          {selected.size}/{fields.length} mező kiválasztva
        </span>
        <button
          onClick={handleApply}
          disabled={isPending}
          style={{
            fontSize: 13, fontWeight: 600, padding: "6px 16px",
            background: selected.size > 0 ? "var(--indigo)" : "var(--bg-inset)",
            color: selected.size > 0 ? "white" : "var(--fg-faint)",
            border: "none", borderRadius: 5, cursor: selected.size > 0 ? "pointer" : "not-allowed",
            opacity: isPending ? 0.6 : 1,
            transition: "all 0.15s",
          }}
        >
          {isPending ? "Alkalmazás..." : "Jóváhagyottak alkalmazása"}
        </button>
      </div>
    </div>
  );
}

// ─── Run row ────────────────────────────────────────────────────────────────────

function RunRow({ run }: { run: RunWithCount }) {
  return (
    <tr style={{ borderBottom: "1px solid var(--line-soft)" }}>
      <td style={{ padding: "10px 12px", fontSize: 13, color: "var(--fg)" }}>
        #{run.id}
      </td>
      <td style={{ padding: "10px 12px", fontSize: 13 }}>
        <span style={{ fontFamily: "var(--font-mono-ndt)", color: "var(--fg-soft)", textTransform: "uppercase", fontSize: 11 }}>
          {run.entityType === "company" ? "cég" : "személy"}
        </span>
      </td>
      <td style={{ padding: "10px 12px", fontSize: 13, color: "var(--fg-soft)" }}>
        {run.entityIds.length} entitás
      </td>
      <td style={{ padding: "10px 12px" }}>
        <StatusBadge status={run.status} />
      </td>
      <td style={{ padding: "10px 12px", fontSize: 12, color: "var(--fg-mute)" }}>
        {run._count.proposals} javaslat
      </td>
      <td style={{ padding: "10px 12px", fontSize: 12, color: "var(--fg-mute)" }}>
        {run.triggeredBy ?? "—"}
      </td>
      <td style={{ padding: "10px 12px", fontSize: 12, color: "var(--fg-faint)" }}>
        {formatRelativeTime(run.createdAt)}
      </td>
    </tr>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────────

export function EnrichmentClient({ runs, proposals }: Props) {
  const [tab, setTab] = useState<"queue" | "runs">("queue");

  const tabStyle = (active: boolean) => ({
    fontSize: 13, fontWeight: 600, padding: "8px 16px",
    cursor: "pointer", border: "none", background: "transparent",
    color: active ? "var(--fg)" : "var(--fg-faint)",
    borderBottom: active ? "2px solid var(--indigo)" : "2px solid transparent",
    transition: "all 0.15s",
  });

  return (
    <div>
      {/* Page header */}
      <div style={{ marginBottom: 24, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--fg)", margin: 0, letterSpacing: "-0.02em" }}>
            Enrichment Engine
          </h1>
          <p style={{ fontSize: 13, color: "var(--fg-mute)", margin: "4px 0 0" }}>
            AI-alapú cég és személy adatfeltöltés — emberi jóváhagyással
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 12, color: "var(--fg-faint)", padding: "4px 10px", border: "1px solid var(--line-soft)", borderRadius: 4, fontFamily: "var(--font-mono-ndt)" }}>
            {proposals.length} várakozó
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ borderBottom: "1px solid var(--line-soft)", marginBottom: 20, display: "flex", gap: 0 }}>
        <button style={tabStyle(tab === "queue")} onClick={() => setTab("queue")}>
          Sor ({proposals.length})
        </button>
        <button style={tabStyle(tab === "runs")} onClick={() => setTab("runs")}>
          Futtatások ({runs.length})
        </button>
      </div>

      {/* Queue tab */}
      {tab === "queue" && (
        <div>
          {proposals.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 0", color: "var(--fg-mute)" }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>
                <SparkleIcon />
              </div>
              <p style={{ fontSize: 14 }}>Nincs várakozó javaslat.</p>
              <p style={{ fontSize: 12, color: "var(--fg-faint)", marginTop: 4 }}>
                Indíts enrichmentet a cégek listájából a "Enrichment futtatása" gombbal.
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {proposals.map((p) => (
                <ProposalCard key={p.id} proposal={p} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Runs tab */}
      {tab === "runs" && (
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--line-soft)", borderRadius: 6, overflow: "hidden" }}>
          {runs.length === 0 ? (
            <div style={{ padding: "40px 0", textAlign: "center", color: "var(--fg-mute)", fontSize: 13 }}>
              Még nem futott enrichment.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "var(--bg-inset)", borderBottom: "1px solid var(--line-soft)" }}>
                  {["#", "Típus", "Entitások", "Státusz", "Javaslatok", "Indította", "Létrehozva"].map((h) => (
                    <th key={h} style={{ padding: "8px 12px", fontSize: 11, fontWeight: 600, color: "var(--fg-faint)", textAlign: "left", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <RunRow key={run.id} run={run} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Sparkle icon (inline SVG) ──────────────────────────────────────────────────

function SparkleIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--indigo)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block" }}>
      <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z"/>
      <path d="M19 15l.75 2.25L22 18l-2.25.75L19 21l-.75-2.25L16 18l2.25-.75z"/>
      <path d="M5 3l.5 1.5L7 5l-1.5.5L5 7l-.5-1.5L3 5l1.5-.5z"/>
    </svg>
  );
}
