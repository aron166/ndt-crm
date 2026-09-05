"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Building2, Phone, Clock, CalendarClock, Trash2, PhoneCall } from "lucide-react";
import { moveLead, deleteLead, setLeadOutcomeAction } from "@/app/actions/leads";
import { DeleteCardDialog, type DeleteCascade } from "@/components/DeleteCardDialog";
import { CallOutcomeModal } from "./CallOutcomeModal";
import { cn, formatDateTime } from "@/lib/utils";
import type { LeadStatusDef } from "@/lib/leads/statuses";
import {
  LEAD_OUTCOMES, LEAD_OUTCOME_LABEL, callbackTone, daysSince, type LeadOutcome,
} from "@/lib/leads/outcomes";

interface Lead {
  id: number;
  status: string | null;
  outcome: string;
  source: string | null;
  sourceApp: string | null;
  subject: string | null;
  serviceInterest: string | null;
  message: string | null;
  estimatedValue: number | null;
  createdAt: string | Date;
  lastContactAt: string | null;
  callbackDueAt: string | null;
  customFields: Record<string, unknown> | null;
  company: { id: number; name: string } | null;
  contact: {
    id: number;
    phone: string | null;
    email: string | null;
    person: { id: number; firstName: string | null; lastName: string | null; phone: string | null } | null;
  } | null;
}

interface LeadsKanbanProps {
  statuses: LeadStatusDef[];
  leads: Lead[];
  /** Total leads per column (the board shows at most `columnLimit` of them). */
  columnTotals: Record<string, number>;
  columnLimit: number;
}

function personNameOf(lead: Lead): string | null {
  const p = lead.contact?.person;
  if (p) return `${p.lastName ?? ""} ${p.firstName ?? ""}`.trim() || null;
  return (lead.customFields?.contact_name as string | undefined) ?? null;
}
function phoneOf(lead: Lead): string | null {
  return lead.contact?.phone ?? lead.contact?.person?.phone ?? (lead.customFields?.contact_phone as string | undefined) ?? null;
}

function LeadCard({
  lead, onDragStart, onDragEnd, onDelete, onCall, onOutcome, dragging,
}: {
  lead: Lead;
  onDragStart: (id: number) => void;
  onDragEnd: () => void;
  onDelete: (id: number) => void;
  onCall: (id: number) => void;
  onOutcome: (id: number, outcome: LeadOutcome) => void;
  dragging: boolean;
}) {
  const router = useRouter();
  const personName = personNameOf(lead);
  const phone = phoneOf(lead);
  const days = daysSince(lead.lastContactAt);
  const cbTone = callbackTone(lead.callbackDueAt);
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <div
      draggable
      onDragStart={() => onDragStart(lead.id)}
      onDragEnd={onDragEnd}
      onClick={() => router.push(`/leads/${lead.id}`)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); router.push(`/leads/${lead.id}`); }
      }}
      className={cn("relative rounded-lg select-none", dragging && "opacity-40 cursor-grabbing")}
      style={{
        background: "var(--bg-panel)",
        border: `1px solid ${cbTone === "overdue" ? "var(--coral)" : "var(--line-soft)"}`,
        padding: "10px 12px", cursor: "grab",
        boxShadow: "inset 0 1px 0 oklch(1 0 0 / 0.05)",
        transition: "transform 280ms cubic-bezier(0.32,0.72,0,1), box-shadow 280ms cubic-bezier(0.32,0.72,0,1), border-color 150ms ease",
        willChange: "transform",
      }}
      onMouseOver={(e) => {
        e.currentTarget.style.boxShadow = "var(--glow-indigo)";
        e.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.boxShadow = "inset 0 1px 0 oklch(1 0 0 / 0.05)";
        e.currentTarget.style.transform = "none";
      }}
    >
      <button
        type="button"
        title="Lead-kártya törlése a pipeline-ból"
        aria-label="Lead-kártya törlése"
        draggable={false}
        onClick={(e) => { e.stopPropagation(); onDelete(lead.id); }}
        className="absolute"
        style={{
          top: 6, right: 6, width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center",
          borderRadius: 5, color: "var(--fg-faint)", background: "var(--bg-hover)", border: "1px solid var(--line-soft)",
        }}
        onMouseOver={(e) => { e.currentTarget.style.color = "var(--coral)"; }}
        onMouseOut={(e) => { e.currentTarget.style.color = "var(--fg-faint)"; }}
      >
        <Trash2 style={{ width: 12, height: 12 }} />
      </button>

      {/* Person (headline) */}
      <Link
        href={`/leads/${lead.id}`}
        onClick={stop}
        style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.35, color: "var(--fg)", display: "block", marginBottom: 3, paddingRight: 24 }}
        onMouseOver={(e) => (e.currentTarget.style.color = "var(--indigo)")}
        onMouseOut={(e) => (e.currentTarget.style.color = "var(--fg)")}
      >
        {personName ?? lead.serviceInterest ?? lead.subject ?? "Névtelen érdeklődő"}
      </Link>

      {lead.company && (
        <Link
          href={`/companies/${lead.company.id}`}
          className="flex items-center gap-1.5"
          style={{ fontSize: 12, color: "var(--fg-mute)", marginBottom: 4 }}
          onClick={stop}
          onMouseOver={(e) => (e.currentTarget.style.color = "var(--indigo)")}
          onMouseOut={(e) => (e.currentTarget.style.color = "var(--fg-mute)")}
        >
          <Building2 style={{ width: 10, height: 10, flexShrink: 0 }} />
          <span className="truncate">{lead.company.name}</span>
        </Link>
      )}

      {phone && (
        <a
          href={`tel:${phone.replace(/\s+/g, "")}`}
          className="flex items-center gap-1.5 font-mono-ndt"
          style={{ fontSize: 12, color: "var(--sky)", marginBottom: 6 }}
          onClick={stop}
        >
          <Phone style={{ width: 11, height: 11, flexShrink: 0 }} />
          {phone}
        </a>
      )}

      {cbTone !== null || lead.callbackDueAt ? (
        <div
          className="flex items-center gap-1 font-mono-ndt"
          title="Visszahívás esedékes"
          style={{
            fontSize: 12, padding: "2px 7px", borderRadius: 4, marginBottom: 6, width: "fit-content",
            background: cbTone === "overdue" ? "var(--coral)" : cbTone === "soon" ? "oklch(0.7 0.15 25 / 0.18)" : "var(--bg-hover)",
            color: cbTone === "overdue" ? "white" : cbTone === "soon" ? "var(--coral)" : "var(--fg-mute)",
            fontWeight: cbTone ? 700 : 500,
          }}
        >
          <CalendarClock style={{ width: 10, height: 10 }} />
          {formatDateTime(lead.callbackDueAt)}
        </div>
      ) : null}

      <div style={{ borderTop: "1px dashed var(--line-soft)", paddingTop: 7, marginTop: 2, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
        <span
          className="flex items-center gap-1 font-mono-ndt"
          title="Utolsó kapcsolatfelvétel óta"
          style={{ fontSize: 12, color: days === null ? "var(--amber)" : days > 7 ? "var(--coral)" : "var(--fg-faint)" }}
        >
          <Clock style={{ width: 10, height: 10 }} />
          {days === null ? "soha" : days === 0 ? "ma" : `${days} napja`}
        </span>
        <div className="flex items-center gap-1" onClick={stop}>
          <button
            type="button"
            className="btn sm"
            title="Hívás eredménye"
            aria-label="Hívás eredménye"
            draggable={false}
            onClick={() => onCall(lead.id)}
            style={{ padding: "2px 7px", gap: 4, fontSize: 12, height: 22 }}
          >
            <PhoneCall style={{ width: 11, height: 11 }} />
            Hívás
          </button>
          {/* The "green dropdown, bottom-right": outcome is orthogonal to the column. */}
          <select
            value={lead.outcome}
            aria-label="Kimenetel"
            draggable={false}
            onChange={(e) => onOutcome(lead.id, e.target.value as LeadOutcome)}
            className="font-mono-ndt"
            style={{
              fontSize: 12, height: 22, padding: "0 4px", borderRadius: 4, fontWeight: 700,
              background: "var(--mint-soft)", color: "var(--mint)", border: "1px solid var(--mint)", outline: "none",
            }}
          >
            {LEAD_OUTCOMES.map((o) => <option key={o} value={o}>{LEAD_OUTCOME_LABEL[o]}</option>)}
          </select>
        </div>
      </div>
    </div>
  );
}

export function LeadsKanban({ statuses, leads: initialLeads, columnTotals, columnLimit }: LeadsKanbanProps) {
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [hoverCol, setHoverCol] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Lead | null>(null);
  const [callingId, setCallingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function handleDrop(statusKey: string) {
    if (!draggingId) return;
    const lead = leads.find((l) => l.id === draggingId);
    if (!lead || lead.status === statusKey) { setDraggingId(null); setHoverCol(null); return; }

    const id = draggingId;
    const prevStatus = lead.status;
    setLeads((prev) => prev.map((l) => l.id === id ? { ...l, status: statusKey } : l));
    setDraggingId(null); setHoverCol(null);
    startTransition(async () => {
      const res = await moveLead(id, statusKey);
      if (res && "error" in res) {
        // Failed move rolls back NOW and says why — never a silent optimistic card.
        setLeads((prev) => prev.map((l) => l.id === id ? { ...l, status: prevStatus } : l));
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  function handleDelete(id: number) {
    const lead = leads.find((l) => l.id === id);
    if (lead) setPendingDelete(lead);
  }

  function confirmDelete(cascade: DeleteCascade) {
    const lead = pendingDelete;
    if (!lead) return;
    setPendingDelete(null);
    setLeads((prev) => prev.filter((l) => l.id !== lead.id));
    startTransition(async () => { await deleteLead(lead.id, cascade); router.refresh(); });
  }

  function handleOutcome(id: number, outcome: LeadOutcome) {
    if (outcome === "open") return;
    // Won/lost leave the active board — optimistic remove; a failure puts it back.
    const snapshot = leads;
    setLeads((prev) => prev.filter((l) => l.id !== id));
    startTransition(async () => {
      const res = await setLeadOutcomeAction(id, outcome);
      if (res && "error" in res) { setLeads(snapshot); setError(res.error); return; }
      router.refresh();
    });
  }

  const colLeads = (statusKey: string) => leads.filter((l) => l.status === statusKey);

  const pendingPersonName = pendingDelete ? personNameOf(pendingDelete) ?? "" : "";
  const calling = callingId != null ? leads.find((l) => l.id === callingId) ?? null : null;

  return (
    <>
    <DeleteCardDialog
      open={pendingDelete !== null}
      kind="lead"
      label={pendingDelete?.serviceInterest || pendingDelete?.subject || "Új érdeklődés"}
      company={pendingDelete?.company ?? null}
      person={pendingPersonName ? { name: pendingPersonName } : null}
      onConfirm={confirmDelete}
      onClose={() => setPendingDelete(null)}
    />
    <CallOutcomeModal
      open={callingId !== null}
      onClose={() => setCallingId(null)}
      leadId={callingId ?? 0}
      title={calling ? [personNameOf(calling), calling.company?.name].filter(Boolean).join(" · ") : null}
      onLogged={() => router.refresh()}
    />
    {error && (
      <div className="panel" style={{ marginBottom: 12 }}>
        <div className="panel-pad flex items-center justify-between" style={{ fontSize: 14, color: "var(--coral)" }}>
          {error}
          <button className="btn sm" onClick={() => setError(null)}>OK</button>
        </div>
      </div>
    )}
    <div className="kboard">
      {statuses.map((status) => {
        const cards = colLeads(status.key);
        const total = columnTotals[status.key] ?? cards.length;
        const isHover = hoverCol === status.key;

        return (
          <div
            key={status.key}
            className="kcol mount"
            style={{
              background: isHover
                ? `${status.color}10`
                : status.isCommitment ? `${status.color}0d` : "oklch(0.18 0.014 255 / 0.5)",
              border: `1px solid ${isHover || status.isCommitment ? status.color : "var(--line-soft)"}`,
              ...(status.isCommitment ? { boxShadow: `0 0 0 1px ${status.color}55, 0 0 14px ${status.color}22` } : {}),
              transition: "border-color .15s, background .15s",
            }}
            onDragOver={(e) => { e.preventDefault(); setHoverCol(status.key); }}
            onDragLeave={() => setHoverCol((p) => p === status.key ? null : p)}
            onDrop={() => handleDrop(status.key)}
          >
            <div className="kcol-head">
              <span className="kcol-dot" style={{ background: status.color, boxShadow: `0 0 8px ${status.color}` }} />
              <span className="kcol-title">{status.label}</span>
              {status.isCommitment && (
                <span
                  className="font-mono-ndt"
                  title="Az időpont lefoglalása maga a megrendelés"
                  style={{
                    fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
                    color: status.color, background: `${status.color}1f`,
                    border: `1px solid ${status.color}55`, borderRadius: 4, padding: "1px 5px",
                  }}
                >
                  Megrendelés
                </span>
              )}
              <span className="kcol-count font-mono-ndt" title={total > cards.length ? `A legújabb ${columnLimit} látszik` : undefined}>
                {total > cards.length ? `${cards.length} / ${total}` : total}
              </span>
            </div>

            <div className="kcol-body">
              {cards.map((lead) => (
                <LeadCard
                  key={lead.id}
                  lead={lead}
                  onDragStart={setDraggingId}
                  onDragEnd={() => { setDraggingId(null); setHoverCol(null); }}
                  onDelete={handleDelete}
                  onCall={setCallingId}
                  onOutcome={handleOutcome}
                  dragging={draggingId === lead.id}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
    </>
  );
}
