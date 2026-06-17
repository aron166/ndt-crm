"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Building2, User, Clock, Tag, Trash2 } from "lucide-react";
import { moveLead, deleteLead } from "@/app/actions/leads";
import { DeleteCardDialog, type DeleteCascade } from "@/components/DeleteCardDialog";
import { formatRelativeTime } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { LeadStatusDef } from "@/lib/leads/statuses";

interface Lead {
  id: number;
  status: string | null;
  source: string | null;
  sourceApp: string | null;
  subject: string | null;
  serviceInterest: string | null;
  message: string | null;
  estimatedValue: number | null;
  createdAt: string | Date;
  customFields: Record<string, unknown> | null;
  company: { id: number; name: string } | null;
  contact: {
    id: number;
    phone: string | null;
    email: string | null;
    person: { id: number; firstName: string | null; lastName: string | null } | null;
  } | null;
}

interface LeadsKanbanProps {
  statuses: LeadStatusDef[];
  leads: Lead[];
}

function LeadCard({
  lead,
  onDragStart,
  onDragEnd,
  onDelete,
  dragging,
}: {
  lead: Lead;
  onDragStart: (id: number) => void;
  onDragEnd: () => void;
  onDelete: (id: number) => void;
  dragging: boolean;
}) {
  const router = useRouter();
  const person = lead.contact?.person;
  const personName = person
    ? `${person.lastName ?? ""} ${person.firstName ?? ""}`.trim()
    : (lead.customFields?.contact_name as string | undefined) ?? null;
  const sourceTag = lead.sourceApp || lead.source;

  return (
    <div
      draggable
      onDragStart={() => onDragStart(lead.id)}
      onDragEnd={onDragEnd}
      onClick={() => router.push(`/leads/${lead.id}`)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        // Only the card itself navigates — let child controls (e.g. delete) handle their own keys.
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); router.push(`/leads/${lead.id}`); }
      }}
      className={cn("relative rounded-lg select-none", dragging && "opacity-40 cursor-grabbing")}
      style={{
        background: "var(--bg-panel)",
        border: "1px solid var(--line-soft)",
        padding: "10px 12px", cursor: "grab",
        boxShadow: "inset 0 1px 0 oklch(1 0 0 / 0.05)",
        transition: "transform 280ms cubic-bezier(0.32,0.72,0,1), box-shadow 280ms cubic-bezier(0.32,0.72,0,1), border-color 150ms ease",
        willChange: "transform",
      }}
      onMouseOver={(e) => {
        e.currentTarget.style.borderColor = "var(--indigo-line)";
        e.currentTarget.style.boxShadow = "var(--glow-indigo)";
        e.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.borderColor = "var(--line-soft)";
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
          borderRadius: 5, color: "var(--fg-faint)", background: "var(--bg-hover)",
          border: "1px solid var(--line-soft)",
        }}
        onMouseOver={(e) => { e.currentTarget.style.color = "var(--coral)"; }}
        onMouseOut={(e) => { e.currentTarget.style.color = "var(--fg-faint)"; }}
      >
        <Trash2 style={{ width: 12, height: 12 }} />
      </button>

      <Link
        href={`/leads/${lead.id}`}
        style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.35, color: "var(--fg)", display: "block", marginBottom: 6, paddingRight: 18 }}
        onMouseOver={(e) => (e.currentTarget.style.color = "var(--indigo)")}
        onMouseOut={(e) => (e.currentTarget.style.color = "var(--fg)")}
        onClick={(e) => e.stopPropagation()}
      >
        {lead.serviceInterest || lead.subject || "Új érdeklődés"}
      </Link>

      {lead.message && (
        <p style={{ fontSize: 11, color: "var(--fg-mute)", lineHeight: 1.4, marginBottom: 8, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {lead.message}
        </p>
      )}

      <div style={{ borderTop: "1px dashed var(--line-soft)", paddingTop: 8, marginTop: 4, display: "flex", flexDirection: "column", gap: 3 }}>
        {lead.company && (
          <Link
            href={`/companies/${lead.company.id}`}
            className="flex items-center gap-1.5"
            style={{ fontSize: 11, color: "var(--fg-mute)" }}
            onClick={(e) => e.stopPropagation()}
            onMouseOver={(e) => (e.currentTarget.style.color = "var(--indigo)")}
            onMouseOut={(e) => (e.currentTarget.style.color = "var(--fg-mute)")}
          >
            <Building2 style={{ width: 10, height: 10, flexShrink: 0 }} />
            <span className="truncate">{lead.company.name}</span>
          </Link>
        )}
        {personName && (
          <div className="flex items-center gap-1.5" style={{ fontSize: 11, color: "var(--fg-faint)" }}>
            <User style={{ width: 10, height: 10, flexShrink: 0 }} />
            <span className="truncate">{personName}</span>
          </div>
        )}
        <div className="flex items-center justify-between" style={{ marginTop: 2 }}>
          {sourceTag && (
            <span className="flex items-center gap-1 font-mono-ndt" style={{ fontSize: 9, color: "var(--fg-faint)", background: "var(--bg-hover)", padding: "1px 6px", borderRadius: 20 }}>
              <Tag style={{ width: 9, height: 9 }} />
              {sourceTag}
            </span>
          )}
          <span className="flex items-center gap-1 font-mono-ndt" style={{ fontSize: 10, color: "var(--fg-faint)" }}>
            <Clock style={{ width: 10, height: 10 }} />
            {formatRelativeTime(lead.createdAt)}
          </span>
        </div>
      </div>
    </div>
  );
}

export function LeadsKanban({ statuses, leads: initialLeads }: LeadsKanbanProps) {
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [hoverCol, setHoverCol] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Lead | null>(null);
  const [, startTransition] = useTransition();

  function handleDrop(statusKey: string) {
    if (!draggingId) return;
    const lead = leads.find((l) => l.id === draggingId);
    if (!lead || lead.status === statusKey) { setDraggingId(null); setHoverCol(null); return; }

    setLeads((prev) => prev.map((l) => l.id === draggingId ? { ...l, status: statusKey } : l));
    const id = draggingId;
    setDraggingId(null); setHoverCol(null);
    startTransition(async () => { await moveLead(id, statusKey); router.refresh(); });
  }

  function handleDelete(id: number) {
    const lead = leads.find((l) => l.id === id);
    if (lead) setPendingDelete(lead);
  }

  function confirmDelete(cascade: DeleteCascade) {
    const lead = pendingDelete;
    if (!lead) return;
    setPendingDelete(null);
    // Optimistic remove; refresh re-syncs from the server (same shape as moveLead).
    setLeads((prev) => prev.filter((l) => l.id !== lead.id));
    startTransition(async () => { await deleteLead(lead.id, cascade); router.refresh(); });
  }

  const colLeads = (statusKey: string) =>
    leads.filter((l) => (l.status ?? "new") === statusKey);

  const pendingPerson = pendingDelete?.contact?.person;
  const pendingPersonName = pendingPerson
    ? `${pendingPerson.lastName ?? ""} ${pendingPerson.firstName ?? ""}`.trim()
    : "";

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
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${statuses.length}, minmax(220px, 1fr))`, gap: 12, alignItems: "start" }}>
      {statuses.map((status) => {
        const cards = colLeads(status.key);
        const isHover = hoverCol === status.key;

        return (
          <div
            key={status.key}
            className="kcol mount"
            style={{
              // The commitment column (booking = the order) gets a permanent
              // accent so the "this is where it becomes a megrendelés" boundary
              // reads at a glance, not just from the label.
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
                    fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
                    color: status.color, background: `${status.color}1f`,
                    border: `1px solid ${status.color}55`, borderRadius: 4, padding: "1px 5px",
                  }}
                >
                  Megrendelés
                </span>
              )}
              <span className="kcol-count font-mono-ndt">{cards.length}</span>
            </div>

            <div className="kcol-body">
              {cards.map((lead) => (
                <LeadCard
                  key={lead.id}
                  lead={lead}
                  onDragStart={setDraggingId}
                  onDragEnd={() => { setDraggingId(null); setHoverCol(null); }}
                  onDelete={handleDelete}
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
