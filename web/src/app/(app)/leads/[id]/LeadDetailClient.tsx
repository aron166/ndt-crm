"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Building2, User, Mail, Phone, Globe, CheckCircle2, Pencil, Trash2, PhoneCall, CalendarClock } from "lucide-react";
import { setLeadOutcomeAction, updateLeadStatus, deleteLead, assignLeadAction } from "@/app/actions/leads";
import { LeadEditModal } from "./LeadEditModal";
import { CallOutcomeModal } from "../CallOutcomeModal";
import { leadStatusLabel, type LeadStatusDef } from "@/lib/leads/statuses";
import { interactionTypeLabel, interactionDirectionLabel } from "@/lib/interactions";
import { LEAD_OUTCOMES, LEAD_OUTCOME_LABEL, callOutcomeLabel, callbackTone, type LeadOutcome } from "@/lib/leads/outcomes";
import { formatDateTime, formatRelativeTime, fullName } from "@/lib/utils";

interface Interaction {
  id: number;
  type: string | null;
  direction: string | null;
  notes: string | null;
  outcome: string | null;
  occurredAt: string | Date;
  leadId?: number | null;
  person: { id: number; firstName: string | null; lastName: string | null } | null;
  user?: { name: string } | null;
}

interface OpenTask {
  id: number;
  title: string;
  dueDate: string | Date | null;
  type: string | null;
  assignedTo: { name: string } | null;
}

interface AuditEntry {
  id: number;
  action: string;
  occurredAt: string | Date;
  changes: unknown;
}

interface Lead {
  id: number;
  status: string | null;
  source: string | null;
  sourceApp: string | null;
  subject: string | null;
  serviceInterest: string | null;
  message: string | null;
  lostReason: string | null;
  outcome: string;
  assignedToId: number | null;
  estimatedValue: number | null;
  receivedDate: string | Date | null;
  convertedDealId: number | null;
  createdAt: string | Date;
  customFields: Record<string, unknown> | null;
  companyId: number | null;
  company: { id: number; name: string; city: string | null; website: string | null } | null;
  contact: {
    id: number; role: string | null; email: string | null; phone: string | null;
    person: { id: number; firstName: string | null; lastName: string | null; email: string | null; phone: string | null } | null;
  } | null;
}

const MARKETING_KEYS = [
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
  "referrer", "landing_variant", "lead_score", "priority",
];

export function LeadDetailClient({
  lead,
  interactions,
  auditEntries,
  statuses,
  users,
  openTasks,
}: {
  lead: Lead;
  interactions: Interaction[];
  auditEntries: AuditEntry[];
  statuses: LeadStatusDef[];
  users: { id: number; name: string }[];
  openTasks: OpenTask[];
}) {
  const router = useRouter();
  const [status, setStatus] = useState(lead.status ?? "new");
  const [outcome, setOutcome] = useState<string>(lead.outcome);
  const [outcomePending, startOutcome] = useTransition();
  const [statusPending, startStatus] = useTransition();
  const [converted, setConverted] = useState<number | null>(lead.convertedDealId ?? null);
  const [editing, setEditing] = useState(false);
  const [logging, setLogging] = useState(false);
  const [deleting, startDelete] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const closed = outcome !== "open" || converted !== null;

  function handleDelete() {
    const label = lead.serviceInterest || lead.subject || `Lead #${lead.id}`;
    if (!confirm(`Biztosan törlöd ezt a leadet: "${label}"?\n\nA cég, a kapcsolattartó és az interakciók megmaradnak — csak a lead-kártya tűnik el.`)) return;
    startDelete(async () => {
      const res = await deleteLead(lead.id);
      if (res?.error) { alert(res.error); return; }
      router.push("/leads");
    });
  }

  const person = lead.contact?.person;
  const personName = person ? fullName(person.firstName, person.lastName) : null;
  const email = lead.contact?.email ?? person?.email ?? (lead.customFields?.contact_email as string | undefined) ?? null;
  const phone = lead.contact?.phone ?? person?.phone ?? (lead.customFields?.contact_phone as string | undefined) ?? null;

  const cf = lead.customFields ?? {};
  const marketing = MARKETING_KEYS
    .map((k) => [k, cf[k]] as const)
    .filter(([, v]) => v !== undefined && v !== null && v !== "");

  function handleStatusChange(next: string) {
    const prev = status;
    setStatus(next);
    setActionError(null);
    startStatus(async () => {
      const res = await updateLeadStatus(lead.id, next);
      if (res && "error" in res) { setStatus(prev); setActionError(res.error); return; }
      router.refresh();
    });
  }

  function handleOutcome(next: LeadOutcome) {
    const prev = outcome;
    setOutcome(next);
    setActionError(null);
    startOutcome(async () => {
      const res = await setLeadOutcomeAction(lead.id, next);
      if ("error" in res) { setOutcome(prev); setActionError(res.error); router.refresh(); return; }
      if (res.dealId) setConverted(res.dealId);
      router.refresh();
    });
  }

  function handleAssign(v: string) {
    startStatus(async () => {
      const res = await assignLeadAction(lead.id, v === "" ? null : Number(v));
      if ("error" in res) setActionError(res.error);
      router.refresh();
    });
  }

  return (
    <div>
      {/* Header */}
      <div className="page-head">
        <div>
          <h1 className="page-title">
            {lead.serviceInterest || lead.subject || "Lead"}
          </h1>
          <p className="page-sub">
            {lead.sourceApp || lead.source || "web"} · érkezett {formatRelativeTime(lead.receivedDate ?? lead.createdAt)}
          </p>
        </div>
        <div className="page-actions" style={{ gap: 8 }}>
          <button onClick={() => setEditing(true)} className="btn" style={{ gap: 6 }}>
            <Pencil style={{ width: 14, height: 14 }} />
            Szerkesztés
          </button>

          <button
            onClick={handleDelete}
            disabled={deleting}
            className="btn"
            style={{ gap: 6, color: "var(--coral)" }}
            title="Lead törlése"
          >
            <Trash2 style={{ width: 14, height: 14 }} />
            {deleting ? "Törlés…" : "Törlés"}
          </button>

          <select
            value={status}
            onChange={(e) => handleStatusChange(e.target.value)}
            disabled={statusPending || closed}
            className="font-mono-ndt"
            style={{
              fontSize: 12, padding: "6px 10px", borderRadius: 6,
              background: "var(--bg-panel)", border: "1px solid var(--line-soft)",
              color: "var(--fg)", outline: "none",
            }}
          >
            {statuses.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>

          {/* Outcome — orthogonal to the stage. `won` is the door to the deal pipeline. */}
          <select
            value={outcome}
            onChange={(e) => handleOutcome(e.target.value as LeadOutcome)}
            disabled={outcomePending}
            className="font-mono-ndt"
            title="Kimenetel"
            style={{
              fontSize: 12, padding: "6px 10px", borderRadius: 6, fontWeight: 600,
              background: outcome === "won" ? "var(--mint-soft)" : outcome === "lost" ? "oklch(0.7 0.15 25 / 0.15)" : "var(--bg-panel)",
              border: `1px solid ${outcome === "won" ? "var(--mint)" : outcome === "lost" ? "var(--coral)" : "var(--line-soft)"}`,
              color: outcome === "won" ? "var(--mint)" : outcome === "lost" ? "var(--coral)" : "var(--fg)", outline: "none",
            }}
          >
            {LEAD_OUTCOMES.map((o) => (
              <option key={o} value={o}>{LEAD_OUTCOME_LABEL[o]}</option>
            ))}
          </select>

          {converted && (
            <Link href="/deals" className="btn" style={{ gap: 6, color: "var(--mint)" }}>
              <CheckCircle2 style={{ width: 14, height: 14 }} />
              Deal #{converted}
            </Link>
          )}

          <button onClick={() => setLogging(true)} disabled={closed} className="btn primary" style={{ gap: 6 }} title={closed ? "Lezárt lead" : undefined}>
            <PhoneCall style={{ width: 14, height: 14 }} />
            Hívás eredménye
          </button>
        </div>
      </div>

      {actionError && (
        <div className="panel" style={{ marginBottom: 12 }}>
          <div className="panel-pad" style={{ fontSize: 13, color: "var(--coral)" }}>{actionError}</div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 16, alignItems: "start" }}>
        {/* Left: entity + source */}
        <div className="space-y-4">
          {/* Company */}
          <div className="panel">
            <div className="panel-head"><div className="panel-title">Cég</div></div>
            <div className="panel-pad space-y-3">
              {lead.company ? (
                <>
                  <Link href={`/companies/${lead.company.id}`} className="flex items-center gap-2" style={{ fontSize: 14, fontWeight: 600, color: "var(--fg)" }}>
                    <Building2 style={{ width: 14, height: 14, color: "var(--indigo)" }} />
                    {lead.company.name}
                  </Link>
                  {lead.company.city && <div className="field-value">{lead.company.city}</div>}
                  {lead.company.website && (
                    <a href={lead.company.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5" style={{ fontSize: 12, color: "var(--sky)" }}>
                      <Globe style={{ width: 12, height: 12 }} />
                      {lead.company.website}
                    </a>
                  )}
                </>
              ) : (
                <div className="field-value">—</div>
              )}
            </div>
          </div>

          {/* Contact */}
          <div className="panel">
            <div className="panel-head"><div className="panel-title">Kapcsolattartó</div></div>
            <div className="panel-pad space-y-3">
              {personName ? (
                <Link href={`/persons/${person!.id}`} className="flex items-center gap-2" style={{ fontSize: 13, fontWeight: 500, color: "var(--fg)" }}>
                  <User style={{ width: 13, height: 13, color: "var(--indigo)" }} />
                  {personName}
                </Link>
              ) : (
                <div className="flex items-center gap-2" style={{ fontSize: 13, color: "var(--fg-mute)" }}>
                  <User style={{ width: 13, height: 13 }} />
                  {(cf.contact_name as string) || "Névtelen"}
                </div>
              )}
              {email && (
                <a href={`mailto:${email}`} className="flex items-center gap-1.5" style={{ fontSize: 12, color: "var(--sky)" }}>
                  <Mail style={{ width: 12, height: 12 }} />{email}
                </a>
              )}
              {phone && (
                <a href={`tel:${phone}`} className="flex items-center gap-1.5" style={{ fontSize: 12, color: "var(--fg-soft)" }}>
                  <Phone style={{ width: 12, height: 12 }} />{phone}
                </a>
              )}
            </div>
          </div>

          {/* Source / marketing */}
          <div className="panel">
            <div className="panel-head"><div className="panel-title">Forrás</div></div>
            <div className="panel-pad space-y-2">
              <div className="flex justify-between" style={{ fontSize: 12 }}>
                <span style={{ color: "var(--fg-mute)" }}>App</span>
                <span className="font-mono-ndt" style={{ color: "var(--fg)" }}>{lead.sourceApp ?? "—"}</span>
              </div>
              <div className="flex justify-between" style={{ fontSize: 12 }}>
                <span style={{ color: "var(--fg-mute)" }}>Csatorna</span>
                <span className="font-mono-ndt" style={{ color: "var(--fg)" }}>{lead.source ?? "—"}</span>
              </div>
              <div className="flex justify-between" style={{ fontSize: 12 }}>
                <span style={{ color: "var(--fg-mute)" }}>Státusz</span>
                <span className="font-mono-ndt" style={{ color: "var(--fg)" }}>{leadStatusLabel(status, statuses)}</span>
              </div>
              <div className="flex justify-between" style={{ fontSize: 12 }}>
                <span style={{ color: "var(--fg-mute)" }}>Kimenetel</span>
                <span className="font-mono-ndt" style={{ color: "var(--fg)" }}>
                  {LEAD_OUTCOME_LABEL[outcome as LeadOutcome] ?? outcome}
                  {outcome === "lost" && lead.lostReason ? ` · ${callOutcomeLabel(lead.lostReason)}` : ""}
                </span>
              </div>
              <div className="flex justify-between items-center" style={{ fontSize: 12 }}>
                <span style={{ color: "var(--fg-mute)" }}>Felelős</span>
                <select
                  defaultValue={lead.assignedToId ?? ""}
                  onChange={(e) => handleAssign(e.target.value)}
                  disabled={statusPending}
                  className="font-mono-ndt"
                  style={{ fontSize: 11, padding: "2px 6px", borderRadius: 5, background: "var(--bg-0)", border: "1px solid var(--line-soft)", color: "var(--fg)" }}
                >
                  <option value="">— nincs —</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              {marketing.length > 0 && (
                <div style={{ paddingTop: 8, marginTop: 4, borderTop: "1px solid var(--line-soft)", display: "flex", flexDirection: "column", gap: 6 }}>
                  {marketing.map(([k, v]) => (
                    <div key={k} className="flex justify-between" style={{ fontSize: 11 }}>
                      <span className="font-mono-ndt" style={{ color: "var(--fg-faint)" }}>{k}</span>
                      <span className="font-mono-ndt" style={{ color: "var(--fg-soft)", textAlign: "right" }}>{String(v)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: message + interactions timeline */}
        <div className="space-y-4">
          {lead.message && (
            <div className="panel">
              <div className="panel-head"><div className="panel-title">Üzenet</div></div>
              <div className="panel-pad">
                <p style={{ fontSize: 13, lineHeight: 1.6, color: "var(--fg-soft)", whiteSpace: "pre-wrap" }}>{lead.message}</p>
              </div>
            </div>
          )}

          {openTasks.length > 0 && (
            <div className="panel">
              <div className="panel-head"><div className="panel-title">Nyitott feladatok · {openTasks.length}</div></div>
              <div className="panel-pad space-y-2">
                {openTasks.map((t) => {
                  const tone = callbackTone(t.dueDate);
                  return (
                    <div key={t.id} className="flex items-center gap-2" style={{ fontSize: 12 }}>
                      <CalendarClock style={{ width: 12, height: 12, color: tone === "overdue" ? "var(--coral)" : tone === "soon" ? "var(--amber)" : "var(--fg-faint)" }} />
                      <Link href="/tasks" className="row-link" style={{ color: "var(--fg)", flex: 1 }}>{t.title}</Link>
                      {t.assignedTo && <span style={{ color: "var(--fg-faint)" }}>{t.assignedTo.name}</span>}
                      <span className="font-mono-ndt" style={{ color: tone === "overdue" ? "var(--coral)" : "var(--fg-mute)", fontSize: 11 }}>
                        {t.dueDate ? formatDateTime(t.dueDate) : "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="panel">
            <div className="panel-head"><div className="panel-title">Hívások és interakciók · {interactions.length}</div></div>
            <div className="panel-pad">
              {interactions.length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--fg-mute)", padding: "8px 0" }}>Nincs rögzített interakció.</div>
              ) : (
                <div className="space-y-3">
                  {interactions.map((r) => (
                    <div key={r.id} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--indigo)", marginTop: 5, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="flex items-center gap-2" style={{ fontSize: 12, marginBottom: 2 }}>
                          <span style={{ color: "var(--fg)", fontWeight: 500 }}>{interactionTypeLabel(r.type)}</span>
                          {r.direction && <span style={{ color: "var(--fg-mute)" }}>· {interactionDirectionLabel(r.direction)}</span>}
                          {r.outcome && (
                            <span className="font-mono-ndt" style={{ fontSize: 10, padding: "1px 6px", borderRadius: 10, background: "var(--bg-hover)", color: "var(--fg-soft)" }}>
                              {callOutcomeLabel(r.outcome)}
                            </span>
                          )}
                          {r.user?.name && <span style={{ color: "var(--fg-faint)", fontSize: 11 }}>· {r.user.name}</span>}
                          <span className="font-mono-ndt" style={{ color: "var(--fg-faint)", fontSize: 10, marginLeft: "auto" }}>{formatDateTime(r.occurredAt)}</span>
                        </div>
                        {r.notes && <p style={{ fontSize: 12, color: "var(--fg-soft)", lineHeight: 1.4 }}>{r.notes}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {auditEntries.length > 0 && (
            <div className="panel">
              <div className="panel-head"><div className="panel-title">Előzmények</div></div>
              <div className="panel-pad">
                <div className="space-y-2">
                  {auditEntries.slice(0, 12).map((a) => (
                    <div key={a.id} className="flex items-center justify-between" style={{ fontSize: 11 }}>
                      <span className="font-mono-ndt" style={{ color: "var(--fg-mute)" }}>{a.action}</span>
                      <span className="font-mono-ndt" style={{ color: "var(--fg-faint)" }}>{formatRelativeTime(a.occurredAt)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <CallOutcomeModal
        open={logging}
        onClose={() => setLogging(false)}
        leadId={lead.id}
        title={[personName, lead.company?.name].filter(Boolean).join(" · ") || null}
        onLogged={() => router.refresh()}
      />

      <LeadEditModal
        open={editing}
        onClose={() => setEditing(false)}
        onSaved={() => router.refresh()}
        initial={{
          id: lead.id,
          subject: lead.subject,
          serviceInterest: lead.serviceInterest,
          source: lead.source,
          estimatedValue: lead.estimatedValue,
          message: lead.message,
          lostReason: lead.lostReason,
          companyId: lead.companyId,
          companyName: lead.company?.name ?? null,
        }}
      />
    </div>
  );
}
