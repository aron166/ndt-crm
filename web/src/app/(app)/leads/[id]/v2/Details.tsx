"use client";

import { CheckCircle2, Globe } from "lucide-react";
import { lostReasonLabel } from "@/lib/leads/lifecycle";
import { LEAD_OUTCOMES, LEAD_OUTCOME_LABEL, callTypeLabel, type LeadOutcome } from "@/lib/leads/outcomes";
import s from "./lead2.module.css";

export interface Fact { label: string; value: string }

const MARKETING_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "referrer", "landing_variant", "lead_score", "priority"];

/** Source / marketing rows: only the ones that have a value. */
export function sourceRows(l: {
  sourceApp: string | null; source: string | null; campaign: string | null; outcome: string; lostReason: string | null; customFields: Record<string, unknown> | null;
}): Fact[] {
  const cf = l.customFields ?? {};
  const rows: Fact[] = [
    { label: "App", value: l.sourceApp ?? "" },
    { label: "Csatorna", value: l.source ?? "" },
    { label: "Kampány", value: l.campaign ?? "" },
    { label: "Kimenetel", value: l.outcome === "open" ? "" : `${LEAD_OUTCOME_LABEL[l.outcome as LeadOutcome] ?? l.outcome}${l.outcome === "lost" && l.lostReason ? ` · ${lostReasonLabel(l.lostReason)}` : ""}` },
    ...MARKETING_KEYS.map((k) => ({ label: k, value: cf[k] == null ? "" : String(cf[k]) })),
  ];
  return rows.filter((r) => r.value !== "");
}

// Closed by default. Everything that is not needed on every visit lives here.
export function Details(p: {
  open: boolean;
  onToggle: (open: boolean) => void;
  facts: Fact[];
  source: Fact[];
  callTypeCounts: { callType: string | null; count: number }[];
  users: { id: number; name: string }[];
  assignedTo: string;
  assignPending: boolean;
  onAssign: (v: string) => void;
  outcome: string;
  outcomePending: boolean;
  onOutcome: (v: LeadOutcome) => void;
  converted: number | null;
  website: string | null;
  children: React.ReactNode;
}) {
  return (
    <details className={s.details} open={p.open} onToggle={(e) => p.onToggle(e.currentTarget.open)}>
      <summary>{/* PROPOSAL copy */}Részletes adatok</summary>
      <div className={s.detailsBody}>
        <div className={s.section}>
          <div className={s.controls}>
            {/* PROPOSAL copy: the two field captions */}
            <label className={s.field}>
              Felelős
              <select id="lead-owner" className={s.select} value={p.assignedTo} disabled={p.assignPending} onChange={(e) => p.onAssign(e.target.value)}>
                <option value="">nincs</option>
                {p.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </label>
            {/* Outcome is orthogonal to the stage. `won` is the door to the deal pipeline. */}
            <label className={s.field}>
              Eredmény
              <select className={s.select} value={p.outcome} disabled={p.outcomePending} onChange={(e) => p.onOutcome(e.target.value as LeadOutcome)}>
                {LEAD_OUTCOMES.map((o) => <option key={o} value={o}>{LEAD_OUTCOME_LABEL[o]}</option>)}
              </select>
            </label>
            {p.converted && <span className={s.link} style={{ color: "var(--ui-text)" }}><CheckCircle2 size={14} />{`Deal #${p.converted}`}</span>}
            {p.website && <a href={p.website} target="_blank" rel="noopener noreferrer" className={s.link}><Globe size={14} />{p.website}</a>}
          </div>
        </div>
        {p.facts.length > 0 && (
          <div className={s.facts}>{p.facts.map((f) => <div key={f.label} className={s.fact}><span>{f.label}</span><span>{f.value}</span></div>)}</div>
        )}
        {(p.source.length > 0 || p.callTypeCounts.length > 0) && (
          <div className={s.section}>
            <h3 className={s.h3}>{/* PROPOSAL copy */}Forrás</h3>
            {p.source.map((r) => <div key={r.label} className={s.kv}><span>{r.label}</span><span>{r.value}</span></div>)}
            {p.callTypeCounts.length > 0 && (
              <div className={s.kv}>
                <span>Hívástípusok</span>
                <span>{p.callTypeCounts.map((c) => `${c.callType ? callTypeLabel(c.callType) : "típus nélkül"}: ${c.count}`).join(" · ")}</span>
              </div>
            )}
          </div>
        )}
        {p.children}
      </div>
    </details>
  );
}
