"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { applyProposal } from "@/app/actions/enrichment";
import { formatRelativeTime } from "@/lib/utils";
import type { FieldChange, ChangesMap } from "@/app/actions/enrichment";
import { PageHeader } from "@/components/astryx/PageHeader";
import k from "@/components/astryx/page.module.css";
import s from "./enrichment.module.css";

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
    pct >= 80 ? "var(--ui-success)" :
    pct >= 60 ? "var(--ui-warning)" :
    "var(--ui-danger)";
  return (
    <div className={s.confRow}>
      <div className={s.confTrack}>
        <div className={s.confFill} style={{ width: `${pct}%`, background: color, transition: "width 0.3s" }} />
      </div>
      <span className={s.confText}>{pct}%</span>
    </div>
  );
}

// ─── Source badge ───────────────────────────────────────────────────────────────

function SourceBadge({ source }: { source: string }) {
  const color =
    source === "registry" ? "var(--ui-success)" :
    source === "inference" ? "var(--ui-accent)" :
    "var(--ui-text-muted)";
  return (
    <span className={s.source} style={{ borderColor: color, color }}>
      {source}
    </span>
  );
}

// ─── Status badge ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    pending:  { label: "Várakozik", color: "var(--ui-warning-text)" },
    running:  { label: "Fut",       color: "var(--ui-accent)" },
    done:     { label: "Kész",      color: "var(--ui-success-text)" },
    failed:   { label: "Hiba",      color: "var(--ui-danger-text)" },
    approved: { label: "Jóváhagyta", color: "var(--ui-success-text)" },
    rejected: { label: "Elutasítva", color: "var(--ui-text-muted)" },
    partial:  { label: "Részleges",  color: "var(--ui-warning-text)" },
  };
  const { label, color } = map[status] ?? { label: status, color: "var(--ui-text-muted)" };
  return (
    <span className={s.status} style={{ color }}>
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
    new Set(Object.keys(proposal.changes).filter((key) => proposal.changes[key]?.status === "pending"))
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
    setSelected(new Set(fields.map(([key]) => key)));
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
      <div className={`${k.card} ${s.done}`}>
        <span className={s.doneLine}>
          <Check size={14} aria-hidden="true" /> Alkalmazva: {proposal.entityName}
        </span>
      </div>
    );
  }

  // Empty proposal — show debug info so we can diagnose
  if (fields.length === 0) {
    const debug = proposal.rawResponse ? (() => {
      try { return JSON.parse(proposal.rawResponse); } catch { return null; }
    })() : null;
    return (
      <div className={k.card}>
        <div className={s.head}>
          <div className={s.headLeft}>
            <Link href={entityHref} className={k.name}>{proposal.entityName}</Link>
            <span className={k.muted}>
              {proposal.entityType === "company" ? "cég" : "személy"}
            </span>
          </div>
          <span className={k.muted}>Nem találtunk változtatnivalót</span>
        </div>
        {debug?.facts && (
          <div>
            <div className={`${k.muted} ${s.debugTitle}`}>Debug: források</div>
            {(debug.facts as string[]).map((f: string, i: number) => (
              <div key={i} className={s.factRow}>
                {f}
              </div>
            ))}
          </div>
        )}
        {proposal.rawResponse?.startsWith("ERROR:") && (
          <div className={k.muted} style={{ color: "var(--ui-danger-text)" }}>
            {proposal.rawResponse}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={k.card}>
      {/* Header */}
      <div className={s.head}>
        <div className={s.headLeft}>
          <Link href={entityHref} className={k.name}>
            {proposal.entityName}
          </Link>
          <span className={k.muted}>
            {proposal.entityType === "company" ? "cég" : "személy"}
          </span>
        </div>
        <div className={s.headActions}>
          <button
            type="button"
            onClick={handleApproveAll}
            className={k.btn}
            style={{ color: "var(--ui-success-text)", borderColor: "var(--ui-success)" }}
          >
            Mind jóváhagy
          </button>
          <button type="button" onClick={handleRejectAll} className={k.btn}>
            Mind elutasít
          </button>
        </div>
      </div>

      {/* Fields */}
      <div className={s.fields}>
        {fields.map(([key, change]) => (
          <label key={key} className={s.fieldRow}>
            <input
              type="checkbox"
              className={s.checkbox}
              checked={selected.has(key)}
              onChange={() => toggleField(key)}
            />
            <div className={s.fieldMain}>
              <div className={s.fieldLine}>
                <span className={s.fieldKey}>
                  {fieldLabel(key)}
                </span>
                <SourceBadge source={change.source} />
                <ConfidenceBar value={change.confidence} />
              </div>
              <div className={s.values}>
                <span className={s.oldValue}>
                  {change.current ?? "(üres)"}
                </span>
                <span className={k.muted}>→</span>
                <span className={s.newValue}>
                  {change.proposed}
                </span>
              </div>
            </div>
          </label>
        ))}
      </div>

      {/* Footer */}
      <div className={s.foot}>
        <span className={k.muted}>
          {selected.size}/{fields.length} mező kiválasztva
        </span>
        <button
          type="button"
          onClick={handleApply}
          disabled={isPending}
          className={selected.size > 0 ? `${k.btn} ${k.btnPrimary}` : k.btn}
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
    <tr>
      <td className={`${k.num} ${s.runsCell}`}>
        #{run.id}
      </td>
      <td>
        <span className={k.muted}>
          {run.entityType === "company" ? "cég" : "személy"}
        </span>
      </td>
      <td className={s.runsCell}>
        {run.entityIds.length} entitás
      </td>
      <td>
        <StatusBadge status={run.status} />
      </td>
      <td className={s.runsCell}>
        {run._count.proposals} javaslat
      </td>
      <td className={s.runsCell}>
        {run.triggeredBy ?? "-"}
      </td>
      <td className={k.muted}>
        {formatRelativeTime(run.createdAt)}
      </td>
    </tr>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────────

export function EnrichmentClient({ runs, proposals }: Props) {
  const [tab, setTab] = useState<"queue" | "runs">("queue");

  return (
    <div>
      <PageHeader
        title="Enrichment Engine"
        help="AI-alapú cég és személy adatfeltöltés: emberi jóváhagyással"
        filters={
          <div className={k.seg}>
            <button
              type="button"
              aria-pressed={tab === "queue"}
              className={`${k.segItem} ${s.segBtn} ${tab === "queue" ? k.segItemOn : ""}`}
              onClick={() => setTab("queue")}
            >
              Sor ({proposals.length})
            </button>
            <button
              type="button"
              aria-pressed={tab === "runs"}
              className={`${k.segItem} ${s.segBtn} ${tab === "runs" ? k.segItemOn : ""}`}
              onClick={() => setTab("runs")}
            >
              Futtatások ({runs.length})
            </button>
          </div>
        }
        actions={
          <span className={s.count}>
            {proposals.length} várakozó
          </span>
        }
      />

      {/* Queue tab */}
      {tab === "queue" && (
        <div>
          {proposals.length === 0 ? (
            <div className={s.empty}>
              <div>
                <SparkleIcon />
              </div>
              <p>Nincs várakozó javaslat.</p>
              <p className={`${k.muted} ${s.emptyNote}`}>
                Indíts enrichmentet a cégek listájából a "Enrichment futtatása" gombbal.
              </p>
            </div>
          ) : (
            <div className={s.stack}>
              {proposals.map((p) => (
                <ProposalCard key={p.id} proposal={p} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Runs tab */}
      {tab === "runs" && (
        runs.length === 0 ? (
          <div className={`${k.empty} ${s.center}`}>
            Még nem futott enrichment.
          </div>
        ) : (
          <div className={k.tableWrap}>
            <table className={k.table}>
              <thead>
                <tr>
                  {["#", "Típus", "Entitások", "Státusz", "Javaslatok", "Indította", "Létrehozva"].map((h) => (
                    <th key={h}>
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
          </div>
        )
      )}
    </div>
  );
}

// ─── Sparkle icon (inline SVG) ──────────────────────────────────────────────────

function SparkleIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--ui-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block" }}>
      <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z"/>
      <path d="M19 15l.75 2.25L22 18l-2.25.75L19 21l-.75-2.25L16 18l2.25-.75z"/>
      <path d="M5 3l.5 1.5L7 5l-1.5.5L5 7l-.5-1.5L3 5l1.5-.5z"/>
    </svg>
  );
}
