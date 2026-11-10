"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, AlertTriangle, Building2, User, Calendar, Trash2 } from "lucide-react";
import { moveDeal, deleteDeal } from "@/app/actions/deals";
import { DealModal } from "./DealModal";
import { DeleteCardDialog, type DeleteCascade } from "@/components/DeleteCardDialog";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface Stage {
  id: number; name: string; color: string;
  probability: number; position: number;
  isTerminalWon: boolean; isTerminalLost: boolean;
}

interface Deal {
  id: number; title: string;
  value: string | number | null;
  currency: string;
  stageId: number | null;
  position: number;
  expectedCloseDate: string | Date | null;
  customFields: Record<string, string> | null;
  company: { id: number; name: string };
  person: { id: number; firstName: string | null; lastName: string | null } | null;
  stage: { id: number; name: string; color: string; isTerminalWon: boolean; isTerminalLost: boolean } | null;
  tasks: { id: number }[];
  pipelineId: number | null;
}

interface CustomField {
  id: number; key: string; label: string; type: string;
  required: boolean; options: unknown;
}

interface Pipeline {
  id: number; name: string;
  stages: Stage[];
  customFields: CustomField[];
}

interface DealsKanbanProps {
  pipeline: Pipeline;
  deals: Deal[];
}

function formatValue(value: string | number | null) {
  if (value == null) return null;
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(n)) return null;
  return Math.round(n).toLocaleString("hu-HU") + " HUF";
}

function DealCard({
  deal,
  onDragStart,
  onDragEnd,
  dragging,
  onEdit,
  onDelete,
}: {
  deal: Deal;
  onDragStart: (id: number) => void;
  onDragEnd: () => void;
  dragging: boolean;
  onEdit: (deal: Deal) => void;
  onDelete: (id: number) => void;
}) {
  const isStale = !deal.stage?.isTerminalWon && !deal.stage?.isTerminalLost && deal.tasks.length === 0;
  const formattedValue = formatValue(deal.value);
  const personName = deal.person
    ? `${deal.person.lastName ?? ""} ${deal.person.firstName ?? ""}`.trim()
    : null;

  return (
    <div
      draggable
      onDragStart={() => onDragStart(deal.id)}
      onDragEnd={onDragEnd}
      onClick={() => onEdit(deal)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        // Only the card itself opens — let child controls (e.g. delete) handle their own keys.
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onEdit(deal); }
      }}
      className={cn("relative rounded-lg select-none", dragging && "opacity-40 cursor-grabbing")}
      style={{
        background: "var(--color-background-card)",
        borderRadius: "var(--radius-container)",
        border: `1px solid ${isStale ? "var(--coral)" : "transparent"}`,
        padding: "12px 14px", cursor: "grab",
        boxShadow: "var(--shadow-low)",
        transition: "transform 280ms cubic-bezier(0.32,0.72,0,1), box-shadow 280ms cubic-bezier(0.32,0.72,0,1), border-color 150ms ease",
        willChange: "transform",
      }}
      onMouseOver={(e) => {
        e.currentTarget.style.borderColor = isStale ? "var(--coral)" : "var(--color-border-emphasized)";
        e.currentTarget.style.boxShadow = "var(--shadow-high)";
        e.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.borderColor = isStale ? "var(--coral)" : "transparent";
        e.currentTarget.style.boxShadow = "var(--shadow-low)";
        e.currentTarget.style.transform = "none";
      }}
    >
      <button
        type="button"
        title="Deal törlése a pipeline-ból"
        aria-label="Deal törlése"
        draggable={false}
        onClick={(e) => { e.stopPropagation(); onDelete(deal.id); }}
        className="absolute"
        style={{
          top: 6, right: 6, width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center",
          borderRadius: 5, color: "var(--color-text-secondary)", background: "var(--color-background-muted)",
          border: "1px solid var(--color-border)",
        }}
        onMouseOver={(e) => { e.currentTarget.style.color = "var(--coral)"; }}
        onMouseOut={(e) => { e.currentTarget.style.color = "var(--color-text-secondary)"; }}
      >
        <Trash2 style={{ width: 12, height: 12 }} />
      </button>

      {/* Stale warning */}
      {isStale && (
        <div className="flex items-center gap-1.5 mb-2" style={{ fontSize: 14, color: "var(--coral)" }}>
          <AlertTriangle style={{ width: 11, height: 11 }} />
          <span>Nincs következő lépés</span>
        </div>
      )}

      {/* Title — presentational only; the parent card handles click + hover */}
      <p
        style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.35, color: "var(--color-text-primary)", marginBottom: 6, paddingRight: 20 }}
      >
        {deal.title}
      </p>

      {/* Value */}
      {formattedValue && (
        <div className="mb-2" style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)", fontVariantNumeric: "tabular-nums" }}>
          {formattedValue}
        </div>
      )}

      {/* Company + person */}
      <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: 8, marginTop: 4, display: "flex", flexDirection: "column", gap: 3 }}>
        <Link
          href={`/companies/${deal.company.id}`}
          className="flex items-center gap-1.5"
          style={{ fontSize: 14, color: "var(--color-text-secondary)" }}
          onClick={(e) => e.stopPropagation()}
          onMouseOver={(e) => (e.currentTarget.style.color = "var(--color-text-primary)")}
          onMouseOut={(e) => (e.currentTarget.style.color = "var(--color-text-secondary)")}
        >
          <Building2 style={{ width: 10, height: 10, flexShrink: 0 }} />
          <span className="truncate">{deal.company.name}</span>
        </Link>
        {personName && (
          <Link
            href={`/persons/${deal.person!.id}`}
            className="flex items-center gap-1.5"
            style={{ fontSize: 14, color: "var(--color-text-secondary)" }}
            onClick={(e) => e.stopPropagation()}
            onMouseOver={(e) => (e.currentTarget.style.color = "var(--color-text-primary)")}
            onMouseOut={(e) => (e.currentTarget.style.color = "var(--color-text-secondary)")}
          >
            <User style={{ width: 10, height: 10, flexShrink: 0 }} />
            <span className="truncate">{personName}</span>
          </Link>
        )}
        {deal.expectedCloseDate && (
          <div className="flex items-center gap-1.5" style={{ fontSize: 14, color: "var(--color-text-secondary)", fontVariantNumeric: "tabular-nums" }}>
            <Calendar style={{ width: 10, height: 10 }} />
            {formatDate(deal.expectedCloseDate)}
          </div>
        )}
      </div>
    </div>
  );
}

export function DealsKanban({ pipeline, deals: initialDeals }: DealsKanbanProps) {
  const router = useRouter();
  const [deals, setDeals] = useState<Deal[]>(initialDeals);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [hoverStage, setHoverStage] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editDeal, setEditDeal] = useState<Deal | null>(null);
  const [newStageId, setNewStageId] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Deal | null>(null);
  const [, startTransition] = useTransition();

  function handleDrop(stageId: number) {
    if (!draggingId) return;
    const deal = deals.find((d) => d.id === draggingId);
    if (!deal || deal.stageId === stageId) { setDraggingId(null); setHoverStage(null); return; }

    const stageDeals = deals.filter((d) => d.stageId === stageId);
    const newPosition = stageDeals.length;

    setDeals((prev) => prev.map((d) => d.id === draggingId ? { ...d, stageId, position: newPosition } : d));
    const id = draggingId;
    setDraggingId(null); setHoverStage(null);
    startTransition(async () => { await moveDeal(id, stageId, newPosition); router.refresh(); });
  }

  function handleDelete(id: number) {
    const deal = deals.find((d) => d.id === id);
    if (deal) setPendingDelete(deal);
  }

  function confirmDelete(cascade: DeleteCascade) {
    const deal = pendingDelete;
    if (!deal) return;
    setPendingDelete(null);
    // Optimistic remove; refresh re-syncs from the server (same shape as moveDeal).
    setDeals((prev) => prev.filter((d) => d.id !== deal.id));
    startTransition(async () => { await deleteDeal(deal.id, cascade); router.refresh(); });
  }

  const stageDeals = (stageId: number) =>
    deals.filter((d) => d.stageId === stageId).sort((a, b) => a.position - b.position);

  const stageValue = (stageId: number) =>
    deals.filter((d) => d.stageId === stageId)
      .reduce((s, d) => s + (d.value ? parseFloat(String(d.value)) : 0), 0);

  const pendingDealPerson = pendingDelete?.person;
  const pendingPersonName = pendingDealPerson
    ? `${pendingDealPerson.lastName ?? ""} ${pendingDealPerson.firstName ?? ""}`.trim()
    : "";

  return (
    <>
      <DeleteCardDialog
        open={pendingDelete !== null}
        kind="deal"
        label={pendingDelete?.title ?? ""}
        company={pendingDelete?.company ?? null}
        person={pendingPersonName ? { name: pendingPersonName } : null}
        onConfirm={confirmDelete}
        onClose={() => setPendingDelete(null)}
      />
      <DealModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditDeal(null); setNewStageId(null); router.refresh(); }}
        pipeline={pipeline}
        initial={editDeal ? {
          id: editDeal.id, title: editDeal.title,
          value: editDeal.value != null ? String(editDeal.value) : "",
          stageId: editDeal.stageId ?? undefined,
          companyId: editDeal.company.id, companyName: editDeal.company.name,
          personId: editDeal.person?.id, personName: editDeal.person ? `${editDeal.person.lastName ?? ""} ${editDeal.person.firstName ?? ""}`.trim() : undefined,
          expectedCloseDate: editDeal.expectedCloseDate ? new Date(editDeal.expectedCloseDate).toISOString().split("T")[0] : undefined,
          customFieldValues: editDeal.customFields ?? undefined,
        } : newStageId ? { stageId: newStageId } : undefined}
      />

      {/* Kanban */}
      <div className="kboard">
        {pipeline.stages.map((stage) => {
          const cards = stageDeals(stage.id);
          const colValue = stageValue(stage.id);
          const isHover = hoverStage === stage.id;

          return (
            <div
              key={stage.id}
              className="kcol mount"
              style={{
                background: isHover ? `color-mix(in srgb, ${stage.color} 6%, transparent)` : "var(--color-background-muted)",
                border: `1px solid ${isHover ? stage.color : "var(--color-border)"}`,
                transition: "border-color .15s, background .15s",
              }}
              onDragOver={(e) => { e.preventDefault(); setHoverStage(stage.id); }}
              onDragLeave={() => setHoverStage((p) => p === stage.id ? null : p)}
              onDrop={() => handleDrop(stage.id)}
            >
              <div className="kcol-head">
                <span className="kcol-dot" style={{ background: stage.color, }} />
                <span className="kcol-title" style={{ fontSize: 15, fontWeight: 600, color: "var(--color-text-primary)" }}>{stage.name}</span>
                <span className="kcol-count" style={{ background: "transparent", color: "var(--color-text-secondary)", fontSize: 14, fontVariantNumeric: "tabular-nums" }}>{cards.length}</span>
                {colValue > 0 && (
                  <span style={{ fontSize: 14, color: "var(--color-text-secondary)", marginLeft: 4, fontVariantNumeric: "tabular-nums" }}>
                    {Math.round(colValue).toLocaleString("hu-HU")}
                  </span>
                )}
              </div>

              <div className="kcol-body">
                {cards.map((deal) => (
                  <DealCard
                    key={deal.id}
                    deal={deal}
                    onDragStart={setDraggingId}
                    onDragEnd={() => { setDraggingId(null); setHoverStage(null); }}
                    dragging={draggingId === deal.id}
                    onEdit={(d) => { setEditDeal(d); setModalOpen(true); }}
                    onDelete={handleDelete}
                  />
                ))}

                {!stage.isTerminalWon && !stage.isTerminalLost && (
                  <button
                    onClick={() => { setNewStageId(stage.id); setEditDeal(null); setModalOpen(true); }}
                    className="btn ghost"
                    style={{ justifyContent: "flex-start", width: "100%", minHeight: 40, fontSize: 14, color: "var(--color-text-secondary)" }}
                  >
                    <Plus style={{ width: 11, height: 11 }} />
                    Deal hozzáadása
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
