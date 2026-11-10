"use client";

import Link from "next/link";
import { Mail, Phone, Globe, CheckCircle2, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { LEAD_OUTCOMES, LEAD_OUTCOME_LABEL, type LeadOutcome } from "@/lib/leads/outcomes";
import { TIER_LABEL, isTier } from "@/lib/leads/tier";
import { formatMinutes } from "@/lib/leads/first-contact";
import { formatRelativeTime } from "@/lib/utils";
import type { LeadStatusDef } from "@/lib/leads/statuses";
import { NextStepStrip } from "./NextStepStrip";
import s from "./lead.module.css";

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

export function LeadHeader(p: {
  lead: HeaderLead;
  displayName: string;
  contactName: string | null;
  role: string | null;
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
}) {
  const { lead } = p;
  const stageLabel = p.statuses.find((x) => x.key === p.status)?.label ?? p.status;
  const ownerName = p.users.find((u) => String(u.id) === p.assignedTo)?.name ?? null;
  // A form slug ("service_concrete") is already shown as a label in the key facts; only free text belongs here.
  const rawSubject = lead.serviceInterest || lead.subject;
  // Slug = lowercase words joined by underscores (service_concrete); a one-word subject like "beton" stays (Vanda C3).
  const subject = rawSubject && !/^[a-z0-9]+(_[a-z0-9]+)+$/.test(rawSubject) ? rawSubject : null;
  const title = lead.company?.name ?? p.displayName;
  const contact = p.contactName && p.personHref ? <Link href={p.personHref}>{p.contactName}</Link> : p.contactName;
  const subParts = [contact, p.role, lead.company?.city].filter(Boolean);
  return (
    <div>
      <div className={s.header}>
        <div className={s.who}>
          <div className={s.meta}>
            {isTier(lead.tier) && <Badge variant="blue" label={`${lead.tier} · ${TIER_LABEL[lead.tier]}`} />}
            <span className={s.muted}>
              {/* PROPOSAL copy */}
              {`L-${lead.id} · ${lead.sourceApp || lead.source || "web"} · felelős: ${ownerName ?? "nincs"}`}
            </span>
          </div>
          <h1 className={s.h1}>{lead.company ? <Link href={`/companies/${lead.company.id}`}>{title}</Link> : title}</h1>
          {subParts.length > 0 && (
            <p className={s.sub}>
              {subParts.map((x, i) => <span key={i}>{i > 0 && ", "}{x}</span>)}
            </p>
          )}
        </div>
        <div className={s.reach}>
          {p.email && <a href={`mailto:${p.email}`} className={s.mail}><Mail size={18} />{p.email}</a>}
          {p.phone ? (
            <a href={`tel:${p.phone.replace(/[^\d+]/g, "")}`} className={s.call}><Phone size={20} />{`Hívás ${p.phone}`}</a>
          ) : (
            <>
              {/* PROPOSAL copy */}
              <span className={s.muted}>Nincs telefonszám</span>
              <Button variant="secondary" size="lg" label="Szerkesztés" icon={<Pencil size={16} />} onClick={p.onEdit} />
            </>
          )}
        </div>
      </div>

      <div className={s.controls}>
        {/* PROPOSAL copy: the three field captions below */}
        <label className={s.field}>
          Szakasz
          <select
            value={p.status}
            onChange={(e) => p.onStatus(e.target.value)}
            disabled={p.statusPending || p.closed}
            className={s.select}
          >
            {/* A lost lead can only be reopened (lost -> new); offering the rest only produced refusals. */}
            {p.statuses.filter((x) => p.status !== "lost" || x.key === "lost" || x.key === "new").map((x) => (
              <option key={x.key} value={x.key}>{x.label}</option>
            ))}
          </select>
        </label>
        {/* Outcome is orthogonal to the stage. `won` is the door to the deal pipeline. */}
        <label className={s.field}>
          Eredmény
          <select
            value={p.outcome}
            onChange={(e) => p.onOutcome(e.target.value as LeadOutcome)}
            disabled={p.outcomePending}
            className={s.select}
          >
            {LEAD_OUTCOMES.map((o) => <option key={o} value={o}>{LEAD_OUTCOME_LABEL[o]}</option>)}
          </select>
        </label>
        <label className={s.field}>
          Felelős
          <select
            value={p.assignedTo}
            onChange={(e) => p.onAssign(e.target.value)}
            disabled={p.statusPending}
            className={s.select}
          >
            <option value="">nincs</option>
            {p.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </label>
        {p.phone && <Button variant="ghost" size="sm" label="Szerkesztés" icon={<Pencil size={14} />} onClick={p.onEdit} />}
        <Button variant="ghost" size="sm" label={p.deleting ? "Törlés…" : "Törlés"} icon={<Trash2 size={14} />} isDisabled={p.deleting} tooltip="Lead törlése" onClick={p.onDelete} />
        {p.converted && (
          <Link href="/deals" className={s.dealLink}><CheckCircle2 size={14} />{`Deal #${p.converted}`}</Link>
        )}
        {lead.company?.website && (
          <a href={lead.company.website} target="_blank" rel="noopener noreferrer" className={s.dealLink}><Globe size={14} />{lead.company.website}</a>
        )}
      </div>

      <div className={s.facts}>
        {subject && <div className={s.fact}><span>Tárgy</span><span>{subject}</span></div>}
        <div className={s.fact}><span>Érkezett</span><span>{formatRelativeTime(lead.receivedDate ?? lead.createdAt)}</span></div>
        <div className={s.fact}>
          <span>Első kontakt</span>
          <span>{p.firstContactMin != null ? `${formatMinutes(p.firstContactMin)} a beérkezés után` : "Még nincs kontakt"}</span>
        </div>
        {p.keyFacts.map((f) => <div key={f.label} className={s.fact}><span>{f.label}</span><span>{f.value}</span></div>)}
      </div>

      <NextStepStrip
        status={p.status}
        stageLabel={stageLabel}
        nextAction={lead.nextAction}
        nextDue={lead.nextDue}
        ownerName={ownerName}
        attempts={lead.attempts}
      />
    </div>
  );
}
