"use client";

import Link from "next/link";
import { Building2, Mail, Phone, Globe, CheckCircle2, Pencil, Trash2, PhoneCall } from "lucide-react";
import { LEAD_OUTCOMES, LEAD_OUTCOME_LABEL, type LeadOutcome } from "@/lib/leads/outcomes";
import { TIER_LABEL, TIER_COLOR, isTier } from "@/lib/leads/tier";
import { formatMinutes } from "@/lib/leads/first-contact";
import { formatRelativeTime } from "@/lib/utils";
import type { LeadStatusDef } from "@/lib/leads/statuses";
import { NextStepStrip } from "./NextStepStrip";

export interface HeaderLead {
  id: number;
  source: string | null;
  sourceApp: string | null;
  subject: string | null;
  serviceInterest: string | null;
  receivedDate: string | Date | null;
  createdAt: string | Date;
  tier: string | null;
  nextAction: string | null;
  nextDue: string | Date | null;
  attempts: number;
  company: { id: number; name: string; city: string | null; website: string | null } | null;
}

const selectBase = { fontSize: 13, padding: "6px 10px", borderRadius: 6, outline: "none" } as const;
const labelStyle = { fontSize: 11, color: "var(--fg-faint)" } as const;

export function LeadHeader(p: {
  lead: HeaderLead;
  displayName: string;
  personHref: string | null;
  email: string | null;
  phone: string | null;
  keyFacts: { label: string; value: string }[];
  firstContactMin: number | null;
  statuses: LeadStatusDef[];
  users: { id: number; name: string }[];
  status: string;
  outcome: string;
  assignedTo: string;
  converted: number | null;
  closed: boolean;
  statusPending: boolean;
  outcomePending: boolean;
  deleting: boolean;
  onStatus: (v: string) => void;
  onOutcome: (v: LeadOutcome) => void;
  onAssign: (v: string) => void;
  onEdit: () => void;
  onDelete: () => void;
  onLog: () => void;
}) {
  const { lead } = p;
  const stageLabel = p.statuses.find((s) => s.key === p.status)?.label ?? p.status;
  const ownerName = p.users.find((u) => String(u.id) === p.assignedTo)?.name ?? null;
  // A form slug ("service_concrete") is already shown as a label in the key facts; only free text belongs here.
  const rawSubject = lead.serviceInterest || lead.subject;
  const subject = rawSubject && !/^[a-z0-9_]+$/.test(rawSubject) ? rawSubject : null;
  const outcomeColor = p.outcome === "won" ? "var(--mint)" : p.outcome === "lost" ? "var(--coral)" : null;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" style={{ marginBottom: 24 }}>
      <div className="lg:col-span-8 space-y-3">
        <h1 className="page-title flex items-center gap-2 flex-wrap" style={{ fontSize: 30, lineHeight: 1.15 }}>
          {isTier(lead.tier) && (
            <span
              className="font-mono-ndt"
              title={TIER_LABEL[lead.tier]}
              style={{
                fontSize: 12, padding: "2px 7px", borderRadius: 4, fontWeight: 700,
                color: TIER_COLOR[lead.tier], border: `1px solid ${TIER_COLOR[lead.tier]}`, background: "var(--bg-hover)",
              }}
            >
              {lead.tier}
            </span>
          )}
          {p.personHref ? <Link href={p.personHref} style={{ color: "inherit" }}>{p.displayName}</Link> : p.displayName}
        </h1>
        {lead.company && (
          <Link href={`/companies/${lead.company.id}`} className="inline-flex items-center gap-1.5" style={{ fontSize: 14, color: "var(--fg-mute)" }}>
            <Building2 style={{ width: 13, height: 13 }} />
            {lead.company.name}{lead.company.city ? ` · ${lead.company.city}` : ""}
          </Link>
        )}
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          {p.phone && (
            <a href={`tel:${p.phone}`} className="inline-flex items-center gap-1.5 min-h-[44px] font-mono-ndt" style={{ fontSize: 16, fontWeight: 600, color: "var(--fg)" }}>
              <Phone style={{ width: 14, height: 14 }} />{p.phone}
            </a>
          )}
          {p.email && (
            <a href={`mailto:${p.email}`} className="inline-flex items-center gap-1.5 min-h-[44px]" style={{ fontSize: 14, color: "var(--sky)" }}>
              <Mail style={{ width: 13, height: 13 }} />{p.email}
            </a>
          )}
          {lead.company?.website && (
            <a href={lead.company.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 min-h-[44px]" style={{ fontSize: 14, color: "var(--sky)" }}>
              <Globe style={{ width: 13, height: 13 }} />{lead.company.website}
            </a>
          )}
        </div>
        {p.keyFacts.length > 0 && (
          <p style={{ fontSize: 14, color: "var(--fg-soft)" }}>
            {p.keyFacts.map((f, i) => (
              <span key={f.label}>{i > 0 && " · "}<span style={{ color: "var(--fg-faint)" }}>{f.label}:</span> {f.value}</span>
            ))}
          </p>
        )}
        <p className="page-sub">
          {subject ? `${subject} · ` : ""}{lead.sourceApp || lead.source || "web"} · érkezett {formatRelativeTime(lead.receivedDate ?? lead.createdAt)}
          {" · "}
          {p.firstContactMin != null ? `Első kontakt: ${formatMinutes(p.firstContactMin)} a beérkezés után` : "Még nincs kontakt"}
        </p>
        <div className="flex gap-2">
          <button onClick={p.onEdit} className="btn ghost min-h-[44px]" style={{ gap: 6 }}>
            <Pencil style={{ width: 14, height: 14 }} />
            Szerkesztés
          </button>
          <button onClick={p.onDelete} disabled={p.deleting} className="btn ghost min-h-[44px]" style={{ gap: 6, color: "var(--coral)" }} title="Lead törlése">
            <Trash2 style={{ width: 14, height: 14 }} />
            {p.deleting ? "Törlés…" : "Törlés"}
          </button>
        </div>
      </div>

      <div className="lg:col-span-4 space-y-3">
        <NextStepStrip
          status={p.status}
          stageLabel={stageLabel}
          nextAction={lead.nextAction}
          nextDue={lead.nextDue}
          ownerName={ownerName}
          attempts={lead.attempts}
        />
        <button onClick={p.onLog} disabled={p.closed} className="btn primary w-full min-h-[44px] justify-center" style={{ gap: 6 }} title={p.closed ? "Lezárt lead" : undefined}>
          <PhoneCall style={{ width: 14, height: 14 }} />
          Hívás eredménye
        </button>
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-3">
          {/* PROPOSAL copy: the three field captions below */}
          <label className="flex flex-col gap-1">
            <span style={labelStyle}>Szakasz</span>
            <select
              value={p.status}
              onChange={(e) => p.onStatus(e.target.value)}
              disabled={p.statusPending || p.closed}
              className="font-mono-ndt min-h-[44px]"
              style={{ ...selectBase, background: "var(--bg-panel)", border: "1px solid var(--line-soft)", color: "var(--fg)" }}
            >
              {/* A lost lead can only be reopened (lost -> new); offering the rest only produced refusals. */}
              {p.statuses.filter((s) => p.status !== "lost" || s.key === "lost" || s.key === "new").map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </label>
          {/* Outcome is orthogonal to the stage. `won` is the door to the deal pipeline. */}
          <label className="flex flex-col gap-1">
            <span style={labelStyle}>Kimenetel</span>
            <select
              value={p.outcome}
              onChange={(e) => p.onOutcome(e.target.value as LeadOutcome)}
              disabled={p.outcomePending}
              className="font-mono-ndt min-h-[44px]"
              title="Kimenetel"
              style={{
                ...selectBase, fontWeight: 600,
                background: p.outcome === "won" ? "var(--mint-soft)" : p.outcome === "lost" ? "var(--coral-soft)" : "var(--bg-panel)",
                border: `1px solid ${outcomeColor ?? "var(--line-soft)"}`, color: outcomeColor ?? "var(--fg)",
              }}
            >
              {LEAD_OUTCOMES.map((o) => (
                <option key={o} value={o}>{LEAD_OUTCOME_LABEL[o]}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span style={labelStyle}>Felelős</span>
            <select
              value={p.assignedTo}
              onChange={(e) => p.onAssign(e.target.value)}
              disabled={p.statusPending}
              className="font-mono-ndt min-h-[44px]"
              style={{ ...selectBase, background: "var(--bg-panel)", border: "1px solid var(--line-soft)", color: "var(--fg)" }}
            >
              <option value="">nincs</option>
              {p.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </label>
        </div>
        {p.converted && (
          <Link href="/deals" className="btn w-full min-h-[44px] justify-center" style={{ gap: 6, color: "var(--mint)" }}>
            <CheckCircle2 style={{ width: 14, height: 14 }} />
            Deal #{p.converted}
          </Link>
        )}
      </div>
    </div>
  );
}
