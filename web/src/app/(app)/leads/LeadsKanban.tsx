"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Building2, Phone, Clock, CalendarClock, Trash2, PhoneCall } from "lucide-react";
import { moveLead, deleteLead, setLeadOutcomeAction } from "@/app/actions/leads";
import { DeleteCardDialog, type DeleteCascade } from "@/components/DeleteCardDialog";
import { CallOutcomeModal } from "./CallOutcomeModal";
import { LeadMoveDialog } from "@/components/LeadMoveDialog";
import { MAX_ATTEMPTS } from "@/lib/leads/lifecycle";
import { cn, formatDateTime } from "@/lib/utils";
import type { LeadStatusDef } from "@/lib/leads/statuses";
import {
  LEAD_OUTCOMES, LEAD_OUTCOME_LABEL, callbackTone, daysSince, type LeadOutcome,
} from "@/lib/leads/outcomes";
import { TIER_LABEL, isTier } from "@/lib/leads/tier";
import { formatMinutes } from "@/lib/leads/first-contact";
import type { ScriptVariant } from "@/lib/leads/scripts";
// Hungarian copy is PROPOSAL until Áron approves.
import { displayScriptText, isPlaceholderText } from "@/lib/leads/placeholder";

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
  tier: string | null;
  firstContactMin: number | null;
  tierFlag: "due" | "overdue" | null;
  createdAt: string | Date;
  lastContactAt: string | null;
  callbackDueAt: string | null;
  customFields: Record<string, unknown> | null;
  attempts: number;
  nextAction: string | null;
  nextDue: string | null;
  owner?: string | null;
  recallDate: string | null;
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
  scriptVariants: ScriptVariant[];
  /** Recall/lost list view (single column) or null for the main board. */
  sideView?: "recall" | "lost" | null;
}

const shortDate = (v: string) => new Date(v).toLocaleDateString("hu-HU", { month: "2-digit", day: "2-digit" });

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
      className={cn("relative select-none", dragging && "opacity-40 cursor-grabbing")}
      style={{
        background: "var(--ui-surface)", borderRadius: "var(--ui-radius-surface)",
        border: `1px solid ${cbTone === "overdue" ? "var(--ui-danger-text)" : "var(--ui-border)"}`,
        padding: "10px 12px", cursor: "grab",
        boxShadow: "var(--ui-shadow-raised)",
        transition: "transform 280ms cubic-bezier(0.32,0.72,0,1), box-shadow 280ms cubic-bezier(0.32,0.72,0,1), border-color 150ms ease",
        willChange: "transform",
      }}
      onMouseOver={(e) => {
        e.currentTarget.style.boxShadow = "var(--ui-shadow-overlay)";
        e.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.boxShadow = "var(--ui-shadow-raised)";
        e.currentTarget.style.transform = "none";
      }}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        title="Lead-kártya törlése a pipeline-ból"
        aria-label="Lead-kártya törlése"
        draggable={false}
        onClick={(e) => { e.stopPropagation(); onDelete(lead.id); }}
        className="absolute top-1 right-1 !size-6 bg-[var(--ui-surface-muted)] text-[var(--ui-text-muted)] hover:text-[var(--ui-danger-text)]"
      >
        <Trash2 style={{ width: 12, height: 12 }} />
      </Button>

      {/* Tier badge */}
      {isTier(lead.tier) && (
        <span
          title={TIER_LABEL[lead.tier]}
          style={{
            display: "inline-block", fontSize: 12, padding: "2px 7px", borderRadius: 4, marginBottom: 3,
            fontWeight: 700, color: "var(--ui-text)", border: "1px solid var(--ui-border-strong)",
            background: "var(--ui-hover)",
          }}
        >
          {lead.tier}
        </span>
      )}

      {lead.tierFlag && (
        <div
          style={{
            display: "inline-block", fontSize: 12, padding: "2px 7px", borderRadius: 4, marginBottom: 3, marginLeft: 6,
            color: lead.tierFlag === "overdue" ? "var(--ui-on-danger)" : "var(--ui-danger-text)",
            background: lead.tierFlag === "overdue" ? "var(--ui-danger)" : "var(--ui-hover)",
            border: `1px solid ${"var(--ui-danger)"}`,
            fontWeight: lead.tierFlag === "overdue" ? 700 : 500,
          }}
        >
          {lead.tierFlag === "overdue" ? "Hívás késésben" : "Hívás 1 órán belül"}
        </div>
      )}
      {lead.firstContactMin != null && (
        <div style={{ fontSize: 12, color: "var(--ui-text-muted)", marginBottom: 3 }}>
          Első kontakt: {formatMinutes(lead.firstContactMin)}
        </div>
      )}

      {/* Person (headline) */}
      <Link
        href={`/leads/${lead.id}`}
        onClick={stop}
        style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.35, color: "var(--ui-text)", display: "block", marginBottom: 3, paddingRight: 24 }}
        onMouseOver={(e) => (e.currentTarget.style.color = "var(--ui-text-link)")}
        onMouseOut={(e) => (e.currentTarget.style.color = "var(--ui-text)")}
      >
        {personName ?? lead.serviceInterest ?? lead.subject ?? "Névtelen érdeklődő"}
      </Link>

      {lead.company && (
        <Link
          href={`/companies/${lead.company.id}`}
          className="flex items-center gap-1.5"
          style={{ fontSize: 12, color: "var(--ui-text-muted)", marginBottom: 4 }}
          onClick={stop}
          onMouseOver={(e) => (e.currentTarget.style.color = "var(--ui-text-link)")}
          onMouseOut={(e) => (e.currentTarget.style.color = "var(--ui-text-muted)")}
        >
          <Building2 style={{ width: 10, height: 10, flexShrink: 0 }} />
          <span className="truncate">{lead.company.name}</span>
        </Link>
      )}

      {phone && (
        <a
          href={`tel:${phone.replace(/\s+/g, "")}`}
          className="flex items-center gap-1.5"
          style={{ fontSize: 12, color: "var(--ui-info-text)", marginBottom: 6 }}
          onClick={stop}
        >
          <Phone style={{ width: 11, height: 11, flexShrink: 0 }} />
          {phone}
        </a>
      )}

      {lead.attempts > 0 && (
        <span
          aria-label={`Próbálkozások: ${lead.attempts} / ${MAX_ATTEMPTS}`}
          style={{ display: "inline-block", fontSize: 12, padding: "2px 7px", borderRadius: 4, marginBottom: 6, marginRight: 6, background: "var(--ui-hover)", color: "var(--ui-text-muted)" }}
        >
          {lead.attempts}/{MAX_ATTEMPTS}
        </span>
      )}
      {(lead.nextAction || lead.nextDue) && (
        <div style={{ fontSize: 12, color: "var(--ui-text)", marginBottom: 6 }}>
          {lead.nextAction}{lead.nextAction && lead.nextDue ? " · " : ""}{lead.nextDue ? shortDate(lead.nextDue) : ""}
        </div>
      )}
      {lead.owner && (
        <div style={{ fontSize: 12, color: "var(--ui-text-muted)", marginBottom: 6 }}>
          {/* PROPOSAL copy */}
          Felelős: {lead.owner}
        </div>
      )}
      {lead.recallDate && (
        <div style={{ fontSize: 12, color: "var(--ui-warning-text)", marginBottom: 6 }}>
          {/* PROPOSAL copy */}
          Visszahívás: {shortDate(lead.recallDate)}
        </div>
      )}

      {cbTone !== null || lead.callbackDueAt ? (
        <div
          className="flex items-center gap-1"
          title="Visszahívás esedékes"
          style={{
            fontSize: 12, padding: "2px 7px", borderRadius: 4, marginBottom: 6, width: "fit-content",
            background: cbTone === "overdue" ? "var(--ui-danger-text)" : cbTone === "soon" ? "var(--ui-danger-surface)" : "var(--ui-hover)",
            color: cbTone === "overdue" ? "white" : cbTone === "soon" ? "var(--ui-danger-text)" : "var(--ui-text-muted)",
            fontWeight: cbTone ? 700 : 500,
          }}
        >
          <CalendarClock style={{ width: 10, height: 10 }} />
          {formatDateTime(lead.callbackDueAt)}
        </div>
      ) : null}

      <div style={{ borderTop: "1px dashed var(--ui-border)", paddingTop: 7, marginTop: 2, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
        <span
          className="flex items-center gap-1"
          title="Utolsó kapcsolatfelvétel óta"
          style={{ fontSize: 12, color: days === null ? "var(--ui-warning-text)" : days > 7 ? "var(--ui-danger-text)" : "var(--ui-text-muted)" }}
        >
          <Clock style={{ width: 10, height: 10 }} />
          {days === null ? "soha" : days === 0 ? "ma" : `${days} napja`}
        </span>
        <div className="flex items-center gap-1" onClick={stop}>
          <Button
            type="button"
            variant="outline"
            size="xs"
            title="Hívás eredménye"
            aria-label="Hívás eredménye"
            draggable={false}
            onClick={() => onCall(lead.id)}
            className="h-[22px] min-h-[22px]"
          >
            <PhoneCall style={{ width: 11, height: 11 }} />
            Hívás
          </Button>
          {/* Outcome dropdown, bottom-right: orthogonal to the column; neutral (taste rule 2026-11-10). */}
          <select
            value={lead.outcome}
            aria-label="Kimenetel"
            draggable={false}
            className="touch44"
            onChange={(e) => onOutcome(lead.id, e.target.value as LeadOutcome)}
            style={{
              fontSize: 12, height: 22, padding: "0 4px", borderRadius: 4, fontWeight: 600,
              background: "var(--ui-surface)", color: "var(--ui-text)", border: "1px solid var(--ui-border-strong)",
            }}
          >
            {LEAD_OUTCOMES.map((o) => <option key={o} value={o}>{LEAD_OUTCOME_LABEL[o]}</option>)}
          </select>
        </div>
      </div>
    </div>
  );
}

export function LeadsKanban({ statuses, leads: initialLeads, columnTotals, columnLimit, scriptVariants }: LeadsKanbanProps) {
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [hoverCol, setHoverCol] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Lead | null>(null);
  const [callingId, setCallingId] = useState<number | null>(null);
  const [moving, setMoving] = useState<{ id: number; target: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function handleDrop(statusKey: string) {
    if (!draggingId) return;
    const lead = leads.find((l) => l.id === draggingId);
    const id = draggingId;
    setDraggingId(null); setHoverCol(null);
    if (!lead || lead.status === statusKey) return;
    setMoving({ id, target: statusKey });
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
    // Lost opens the move dialog (Hungarian reason picker) instead of a prompt.
    if (outcome === "lost") { setMoving({ id, target: "lost" }); return; }
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
    {moving && (
      <LeadMoveDialog
        leadId={moving.id}
        target={moving.target}
        targetLabel={statuses.find((s) => s.key === moving.target)?.label ?? moving.target}
        onClose={() => setMoving(null)}
        onMoved={() => { setMoving(null); router.refresh(); }}
      />
    )}
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
      stageDescription={statuses.find((s) => s.key === calling?.status)?.description ?? null}
      onLogged={() => router.refresh()}
      scriptVariants={scriptVariants}
    />
    {error && (
      <div className="panel" style={{ marginBottom: 12 }}>
        <div className="panel-pad flex items-center justify-between" style={{ fontSize: 14, color: "var(--ui-danger-text)" }}>
          {error}
          <Button variant="outline" size="sm" onClick={() => setError(null)}>OK</Button>
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
              // Stage colour is user data: only the header dot carries it (taste rule, 2026-11-10).
              background: isHover ? "var(--ui-hover)" : "var(--ui-surface-muted)",
              border: `1px solid ${isHover ? "var(--ui-border-strong)" : "var(--ui-border)"}`,
              transition: "border-color .15s, background .15s",
            }}
            onDragOver={(e) => { e.preventDefault(); setHoverCol(status.key); }}
            onDragLeave={() => setHoverCol((p) => p === status.key ? null : p)}
            onDrop={() => handleDrop(status.key)}
          >
            <div className="kcol-head">
              <span className="kcol-dot" style={{ background: status.color }} />
              <span className="kcol-title">{status.label}</span>
              {status.isCommitment && (
                <span
                  title="Az időpont lefoglalása maga a megrendelés"
                  style={{
                    fontSize: 12, fontWeight: 700,
                    color: "var(--ui-text-muted)", background: "var(--ui-surface)",
                    border: "1px solid var(--ui-border)", borderRadius: 4, padding: "1px 5px",
                  }}
                >
                  Megrendelés
                </span>
              )}
              <span className="kcol-count" title={total > cards.length ? `A legújabb ${columnLimit} látszik` : undefined}>
                {total > cards.length ? `${cards.length} / ${total}` : total}
              </span>
            </div>

            {status.description && (
              <details>
                <summary style={{ fontSize: 12, color: "var(--ui-text-muted)", cursor: "pointer", padding: "0 10px 6px", listStyle: "none" }}>
                  Mit csinálunk itt?
                </summary>
                <div style={{ fontSize: 12, color: "var(--ui-text)", whiteSpace: "pre-wrap", padding: "0 10px 8px", lineHeight: 1.5 }}>
                  {displayScriptText(status.description)}
                  {isPlaceholderText(status.description) && (
                    <> <Link href="/leads/setup" style={{ color: "var(--ui-text-link)" }}>Beállítás</Link></>
                  )}
                </div>
              </details>
            )}

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
