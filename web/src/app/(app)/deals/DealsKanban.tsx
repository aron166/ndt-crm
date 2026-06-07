"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, AlertTriangle, Building2, User, Calendar } from "lucide-react";
import { moveDeal } from "@/app/actions/deals";
import { DealModal } from "./DealModal";
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
}: {
  deal: Deal;
  onDragStart: (id: number) => void;
  onDragEnd: () => void;
  dragging: boolean;
  onEdit: (deal: Deal) => void;
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
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onEdit(deal); }
      }}
      className={cn("rounded-lg select-none", dragging && "opacity-40 cursor-grabbing")}
      style={{
        background: "var(--bg-panel)",
        border: `1px solid ${isStale ? "oklch(0.72 0.18 25 / 0.5)" : "var(--line-soft)"}`,
        padding: "10px 12px", cursor: "grab",
        boxShadow: isStale ? "inset 0 0 0 1px oklch(0.72 0.18 25 / 0.15)" : "inset 0 1px 0 oklch(1 0 0 / 0.05)",
        transition: "transform 280ms cubic-bezier(0.32,0.72,0,1), box-shadow 280ms cubic-bezier(0.32,0.72,0,1), border-color 150ms ease",
        willChange: "transform",
      }}
      onMouseOver={(e) => {
        e.currentTarget.style.borderColor = isStale ? "var(--coral)" : "var(--indigo-line)";
        e.currentTarget.style.boxShadow = isStale ? "var(--glow-amber)" : "var(--glow-indigo)";
        e.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.borderColor = isStale ? "oklch(0.72 0.18 25 / 0.5)" : "var(--line-soft)";
        e.currentTarget.style.boxShadow = isStale ? "inset 0 0 0 1px oklch(0.72 0.18 25 / 0.15)" : "inset 0 1px 0 oklch(1 0 0 / 0.05)";
        e.currentTarget.style.transform = "none";
      }}
    >
      {/* Stale warning */}
      {isStale && (
        <div className="flex items-center gap-1.5 mb-2" style={{ fontSize: 10, color: "var(--coral)" }}>
          <AlertTriangle style={{ width: 11, height: 11 }} />
          <span className="font-mono-ndt">Nincs következő lépés</span>
        </div>
      )}

      {/* Title — presentational only; the parent card handles click + hover */}
      <p
        style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.35, color: "var(--fg)", marginBottom: 6 }}
      >
        {deal.title}
      </p>

      {/* Value */}
      {formattedValue && (
        <div className="font-mono-ndt mb-2" style={{ fontSize: 14, fontWeight: 500, color: "var(--mint)" }}>
          {formattedValue}
        </div>
      )}

      {/* Company + person */}
      <div style={{ borderTop: "1px dashed var(--line-soft)", paddingTop: 8, marginTop: 4, display: "flex", flexDirection: "column", gap: 3 }}>
        <Link
          href={`/companies/${deal.company.id}`}
          className="flex items-center gap-1.5"
          style={{ fontSize: 11, color: "var(--fg-mute)" }}
          onClick={(e) => e.stopPropagation()}
          onMouseOver={(e) => (e.currentTarget.style.color = "var(--indigo)")}
          onMouseOut={(e) => (e.currentTarget.style.color = "var(--fg-mute)")}
        >
          <Building2 style={{ width: 10, height: 10, flexShrink: 0 }} />
          <span className="truncate">{deal.company.name}</span>
        </Link>
        {personName && (
          <Link
            href={`/persons/${deal.person!.id}`}
            className="flex items-center gap-1.5"
            style={{ fontSize: 11, color: "var(--fg-faint)" }}
            onClick={(e) => e.stopPropagation()}
            onMouseOver={(e) => (e.currentTarget.style.color = "var(--indigo)")}
            onMouseOut={(e) => (e.currentTarget.style.color = "var(--fg-faint)")}
          >
            <User style={{ width: 10, height: 10, flexShrink: 0 }} />
            <span className="truncate">{personName}</span>
          </Link>
        )}
        {deal.expectedCloseDate && (
          <div className="flex items-center gap-1.5 font-mono-ndt" style={{ fontSize: 10, color: "var(--fg-faint)" }}>
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

  const stageDeals = (stageId: number) =>
    deals.filter((d) => d.stageId === stageId).sort((a, b) => a.position - b.position);

  const stageValue = (stageId: number) =>
    deals.filter((d) => d.stageId === stageId)
      .reduce((s, d) => s + (d.value ? parseFloat(String(d.value)) : 0), 0);

  return (
    <>
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
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${pipeline.stages.length}, minmax(240px, 1fr))`, gap: 12, alignItems: "start" }}>
        {pipeline.stages.map((stage) => {
          const cards = stageDeals(stage.id);
          const colValue = stageValue(stage.id);
          const isHover = hoverStage === stage.id;

          return (
            <div
              key={stage.id}
              className="kcol mount"
              style={{
                background: isHover ? `${stage.color}10` : "oklch(0.18 0.014 255 / 0.5)",
                border: `1px solid ${isHover ? stage.color : "var(--line-soft)"}`,
                transition: "border-color .15s, background .15s",
              }}
              onDragOver={(e) => { e.preventDefault(); setHoverStage(stage.id); }}
              onDragLeave={() => setHoverStage((p) => p === stage.id ? null : p)}
              onDrop={() => handleDrop(stage.id)}
            >
              <div className="kcol-head">
                <span className="kcol-dot" style={{ background: stage.color, boxShadow: `0 0 8px ${stage.color}` }} />
                <span className="kcol-title">{stage.name}</span>
                <span className="kcol-count font-mono-ndt">{cards.length}</span>
                {colValue > 0 && (
                  <span className="font-mono-ndt" style={{ fontSize: 10, color: "var(--fg-faint)", marginLeft: 4 }}>
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
                  />
                ))}

                {!stage.isTerminalWon && !stage.isTerminalLost && (
                  <button
                    onClick={() => { setNewStageId(stage.id); setEditDeal(null); setModalOpen(true); }}
                    className="btn ghost"
                    style={{ justifyContent: "flex-start", width: "100%", height: 30, fontSize: 12, color: "var(--fg-mute)" }}
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
