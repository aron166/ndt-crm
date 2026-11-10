"use client";
// Hungarian copy is PROPOSAL until Áron approves.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, GripVertical } from "lucide-react";
import {
  createLeadStatus,
  upsertLeadStatus,
  deleteLeadStatus,
  reorderLeadStatuses,
  seedDefaultLeadStatuses,
} from "@/app/actions/leads";
import { Badge } from "@astryxdesign/core/Badge";
import k from "@/components/astryx/page.module.css";
import m from "./setup.module.css";
import { isPlaceholderText } from "@/lib/leads/placeholder";
import { STAGE_DESCRIPTION_PLACEHOLDER, STAGE_DESCRIPTION_MAX } from "@/lib/leads/statuses";

const STATUS_COLORS = [
  "#64748b", "#6366f1", "#8b5cf6", "#3b82f6",
  "#06b6d4", "#22c55e", "#f59e0b", "#f97316",
  "#ef4444", "#f43f5e",
];

interface LeadStatus {
  id: number;
  key: string;
  label: string;
  color: string;
  position: number;
  isInitial: boolean;
  isTerminal: boolean;
  isCommitment: boolean;
  description: string | null;
}

function StatusRow({
  status,
  dragHandle,
}: {
  status: LeadStatus;
  dragHandle?: React.HTMLAttributes<HTMLSpanElement> & { draggable?: boolean };
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(status.label);
  const [color, setColor] = useState(status.color);
  const [description, setDescription] = useState(status.description ?? "");
  const [isInitial, setIsInitial] = useState(status.isInitial);
  const [isTerminal, setIsTerminal] = useState(status.isTerminal);
  const [isCommitment, setIsCommitment] = useState(status.isCommitment);
  const [isPending, startTransition] = useTransition();

  function save() {
    const data = new FormData();
    data.set("id", String(status.id));
    data.set("label", label);
    data.set("color", color);
    data.set("description", description);
    data.set("isInitial", String(isInitial));
    data.set("isTerminal", String(isTerminal));
    data.set("isCommitment", String(isCommitment));
    startTransition(async () => { await upsertLeadStatus(data); setEditing(false); router.refresh(); });
  }

  function handleDelete() {
    if (!confirm(`Törlöd a(z) "${status.label}" státuszt? A benne lévő leadek a kezdő oszlopba kerülnek.`)) return;
    startTransition(async () => {
      const res = await deleteLeadStatus(status.id);
      if (res?.error) alert(res.error);
      router.refresh();
    });
  }

  if (!editing) {
    return (
      <div className={m.row} onClick={() => setEditing(true)}>
        <span
          {...dragHandle}
          onClick={(e) => e.stopPropagation()}
          title="Húzd az átrendezéshez"
          className={m.grip}
          style={{ cursor: dragHandle ? "grab" : "default" }}
        >
          <GripVertical style={{ width: 14, height: 14 }} />
        </span>
        <span className={m.dot} style={{ background: status.color }} />
        <span className={m.rowLabel}>{status.label}</span>
        <div className={m.badges}>
          {status.isInitial && <Badge variant="info" label="Kezdő" />}
          {status.isCommitment && <Badge variant="success" label="Megrendelés" />}
          {status.isTerminal && <Badge variant="error" label="Lezárt" />}
          {(!status.description || isPlaceholderText(status.description)) && (
            <Badge variant="error" label="Nincs script" />
          )}
        </div>
        <button aria-label={`Törlés: ${status.label}`} onClick={(e) => { e.stopPropagation(); handleDelete(); }}
          className={`${k.btn} ${k.btnIcon} ${m.danger}`}
        >
          <Trash2 style={{ width: 13, height: 13 }} />
        </button>
      </div>
    );
  }

  return (
    <div className={m.editor}>
      <div>
        <label className={m.label}>Státusz neve</label>
        <input className={m.field} value={label} onChange={(e) => setLabel(e.target.value)} />
      </div>
      <div>
        <label className={m.label}>Szín</label>
        <div className={m.swatches}>
          {STATUS_COLORS.map((c) => (
            <button key={c} type="button" onClick={() => setColor(c)} className={m.swatch}
              style={{
                background: c,
                outline: color === c ? `2px solid ${c}` : "none", outlineOffset: 2,
                // affordance, not decoration — keep a literal radius in both themes so the selected swatch stays visible
                boxShadow: color === c ? `0 0 8px ${c}` : "none",
              }}
            />
          ))}
        </div>
      </div>
      <div>
        <label className={m.label}>Mit csinálunk ebben a fázisban? (script)</label>
        <textarea
          className={`${m.field} ${m.textarea}`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={6}
          maxLength={STAGE_DESCRIPTION_MAX}
          placeholder={STAGE_DESCRIPTION_PLACEHOLDER}
        />
        <p className={`${k.muted} ${m.hint}`}>
          Ez jelenik meg a kanban oszlop fejlécében és a hívás-modalban. Sortörések megmaradnak.
        </p>
      </div>
      <div className={m.checks}>
        <label className={m.check}>
          <input type="checkbox" checked={isInitial} onChange={(e) => { setIsInitial(e.target.checked); if (e.target.checked) { setIsTerminal(false); setIsCommitment(false); } }} />
          Kezdő (ide érkeznek a leadek)
        </label>
        <label className={m.check}>
          <input type="checkbox" checked={isCommitment} onChange={(e) => { setIsCommitment(e.target.checked); if (e.target.checked) { setIsInitial(false); setIsTerminal(false); } }} />
          Megrendelés (a lefoglalás = az order)
        </label>
        <label className={m.check}>
          <input type="checkbox" checked={isTerminal} onChange={(e) => { setIsTerminal(e.target.checked); if (e.target.checked) { setIsInitial(false); setIsCommitment(false); } }} />
          Lezárt (greyed)
        </label>
      </div>
      <div className={m.footer}>
        <button type="button" className={k.btn} onClick={() => setEditing(false)}>Mégse</button>
        <button type="button" className={`${k.btn} ${k.btnPrimary}`} onClick={save} disabled={isPending}>
          {isPending ? "Mentés..." : "Mentés"}
        </button>
      </div>
    </div>
  );
}

export function LeadStatusSetupClient({ statuses }: { statuses: LeadStatus[] }) {
  const router = useRouter();
  const [items, setItems] = useState(statuses);
  const [prevStatuses, setPrevStatuses] = useState(statuses);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState("#6366f1");
  const [isPending, startTransition] = useTransition();

  // Render-phase sync when the server sends a fresh order/list.
  if (prevStatuses !== statuses) {
    setPrevStatuses(statuses);
    setItems(statuses);
  }

  function handleDrop() {
    if (dragIndex === null || overIndex === null || dragIndex === overIndex) {
      setDragIndex(null); setOverIndex(null);
      return;
    }
    const prev = items;
    const next = [...items];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(overIndex, 0, moved);
    setItems(next);
    setDragIndex(null); setOverIndex(null);
    const orderedIds = next.map((s) => s.id);
    startTransition(async () => {
      const res = await reorderLeadStatuses(orderedIds);
      if (res?.error) setItems(prev);
      router.refresh();
    });
  }

  function handleAdd() {
    if (!newLabel.trim()) return;
    const data = new FormData();
    data.set("label", newLabel.trim());
    data.set("color", newColor);
    startTransition(async () => {
      await createLeadStatus(data);
      setNewLabel(""); setNewColor("#6366f1"); setAdding(false);
      router.refresh();
    });
  }

  if (items.length === 0) {
    return (
      <section className={k.section}>
        <div className={`${k.empty} ${m.centerEmpty}`}>
          <p className={k.muted}>
            Még nincsenek lead státuszok.
          </p>
          <button
            type="button"
            className={`${k.btn} ${k.btnPrimary}`}
            disabled={isPending}
            onClick={() => startTransition(async () => { await seedDefaultLeadStatuses(); router.refresh(); })}
          >
            Alapértelmezett státuszok létrehozása
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className={k.section}>
      <div className={m.list}>
        {items.map((status, i) => {
          const showIndicator = dragIndex !== null && overIndex === i && dragIndex !== i;
          return (
            <div
              key={status.id}
              onDragOver={(e) => { e.preventDefault(); setOverIndex(i); }}
              onDrop={handleDrop}
              style={{
                opacity: dragIndex === i ? 0.4 : 1,
                borderTop: `2px solid ${showIndicator ? "var(--ui-accent)" : "transparent"}`,
                borderRadius: 2,
                transition: "opacity .15s",
              }}
            >
              <StatusRow
                status={status}
                dragHandle={{
                  draggable: true,
                  onDragStart: () => setDragIndex(i),
                  onDragEnd: () => { setDragIndex(null); setOverIndex(null); },
                }}
              />
            </div>
          );
        })}

        {adding ? (
          <div className={m.editor}>
            <div>
              <label className={m.label}>Státusz neve</label>
              <input
                className={m.field}
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="pl. Ajánlat egyeztetés alatt"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              />
            </div>
            <div>
              <label className={m.label}>Szín</label>
              <div className={m.swatches}>
                {STATUS_COLORS.map((c) => (
                  <button key={c} type="button" onClick={() => setNewColor(c)} className={m.swatch}
                    style={{
                      background: c,
                      outline: newColor === c ? `2px solid ${c}` : "none", outlineOffset: 2,
                    }}
                  />
                ))}
              </div>
            </div>
            <div className={m.footer}>
              <button type="button" className={k.btn} onClick={() => { setAdding(false); setNewLabel(""); }}>Mégse</button>
              <button type="button" className={`${k.btn} ${k.btnPrimary}`} onClick={handleAdd} disabled={isPending || !newLabel.trim()}>
                Hozzáadás
              </button>
            </div>
          </div>
        ) : (
          <div>
            <button className={k.btn} onClick={() => setAdding(true)}>
              <Plus style={{ width: 14, height: 14 }} /> Státusz hozzáadása
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
