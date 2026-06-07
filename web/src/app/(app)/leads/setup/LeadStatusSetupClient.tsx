"use client";

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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

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
  const [isInitial, setIsInitial] = useState(status.isInitial);
  const [isTerminal, setIsTerminal] = useState(status.isTerminal);
  const [isCommitment, setIsCommitment] = useState(status.isCommitment);
  const [isPending, startTransition] = useTransition();

  function save() {
    const data = new FormData();
    data.set("id", String(status.id));
    data.set("label", label);
    data.set("color", color);
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
      <div
        className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
        style={{ border: "1px solid var(--line-soft)", background: "var(--bg-panel)", cursor: "pointer" }}
        onClick={() => setEditing(true)}
      >
        <span
          {...dragHandle}
          onClick={(e) => e.stopPropagation()}
          title="Húzd az átrendezéshez"
          style={{ display: "flex", flexShrink: 0, cursor: dragHandle ? "grab" : "default", touchAction: "none" }}
        >
          <GripVertical style={{ width: 14, height: 14, color: "var(--fg-faint)" }} />
        </span>
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: status.color, flexShrink: 0, boxShadow: `0 0 6px ${status.color}` }} />
        <span style={{ flex: 1, fontSize: 13, color: "var(--fg)" }}>{status.label}</span>
        {status.isInitial && <span className="badge-ds indigo" style={{ fontSize: 10 }}>Kezdő</span>}
        {status.isCommitment && (
          <span style={{ fontSize: 10, fontWeight: 600, color: "#16a34a", background: "#16a34a1f", border: "1px solid #16a34a55", borderRadius: 4, padding: "1px 6px" }}>
            Megrendelés
          </span>
        )}
        {status.isTerminal && <span className="badge-ds coral" style={{ fontSize: 10 }}>Lezárt</span>}
        <button onClick={(e) => { e.stopPropagation(); handleDelete(); }}
          style={{ padding: 4, color: "var(--fg-faint)", cursor: "pointer", background: "none", border: "none" }}
          onMouseOver={(e) => (e.currentTarget.style.color = "var(--coral)")}
          onMouseOut={(e) => (e.currentTarget.style.color = "var(--fg-faint)")}
        >
          <Trash2 style={{ width: 13, height: 13 }} />
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl p-4 space-y-3" style={{ border: "1px solid var(--indigo-line)", background: "var(--bg-panel)" }}>
      <div>
        <label className="field-label">Státusz neve</label>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} />
      </div>
      <div>
        <label className="field-label">Szín</label>
        <div className="flex gap-2 flex-wrap">
          {STATUS_COLORS.map((c) => (
            <button key={c} type="button" onClick={() => setColor(c)}
              style={{
                width: 24, height: 24, borderRadius: "50%", background: c, cursor: "pointer",
                outline: color === c ? `2px solid ${c}` : "none", outlineOffset: 2,
                boxShadow: color === c ? `0 0 8px ${c}` : "none",
              }}
            />
          ))}
        </div>
      </div>
      <div className="flex gap-4 text-sm flex-wrap" style={{ color: "var(--fg-soft)" }}>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={isInitial} onChange={(e) => { setIsInitial(e.target.checked); if (e.target.checked) { setIsTerminal(false); setIsCommitment(false); } }} />
          Kezdő (ide érkeznek a leadek)
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={isCommitment} onChange={(e) => { setIsCommitment(e.target.checked); if (e.target.checked) { setIsInitial(false); setIsTerminal(false); } }} />
          Megrendelés (a lefoglalás = az order)
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={isTerminal} onChange={(e) => { setIsTerminal(e.target.checked); if (e.target.checked) { setIsInitial(false); setIsCommitment(false); } }} />
          Lezárt (greyed)
        </label>
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setEditing(false)}>Mégse</Button>
        <Button type="button" size="sm" className="btn primary" onClick={save} disabled={isPending}>
          {isPending ? "Mentés..." : "Mentés"}
        </Button>
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
      <div className="panel">
        <div className="panel-pad" style={{ textAlign: "center", padding: "32px 0" }}>
          <p style={{ fontSize: 13, color: "var(--fg-mute)", marginBottom: 16 }}>
            Még nincsenek lead státuszok.
          </p>
          <Button
            type="button"
            className="btn primary"
            disabled={isPending}
            onClick={() => startTransition(async () => { await seedDefaultLeadStatuses(); router.refresh(); })}
          >
            Alapértelmezett státuszok létrehozása
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-pad space-y-2">
        {items.map((status, i) => {
          const showIndicator = dragIndex !== null && overIndex === i && dragIndex !== i;
          return (
            <div
              key={status.id}
              onDragOver={(e) => { e.preventDefault(); setOverIndex(i); }}
              onDrop={handleDrop}
              style={{
                opacity: dragIndex === i ? 0.4 : 1,
                borderTop: `2px solid ${showIndicator ? "var(--indigo)" : "transparent"}`,
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
          <div className="rounded-xl p-4 space-y-3" style={{ border: "1px solid var(--indigo-line)", background: "var(--bg-panel)" }}>
            <div>
              <label className="field-label">Státusz neve</label>
              <Input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="pl. Ajánlat egyeztetés alatt"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              />
            </div>
            <div>
              <label className="field-label">Szín</label>
              <div className="flex gap-2 flex-wrap">
                {STATUS_COLORS.map((c) => (
                  <button key={c} type="button" onClick={() => setNewColor(c)}
                    style={{
                      width: 22, height: 22, borderRadius: "50%", background: c, cursor: "pointer",
                      outline: newColor === c ? `2px solid ${c}` : "none", outlineOffset: 2,
                    }}
                  />
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => { setAdding(false); setNewLabel(""); }}>Mégse</Button>
              <Button type="button" size="sm" className="btn primary" onClick={handleAdd} disabled={isPending || !newLabel.trim()}>
                Hozzáadás
              </Button>
            </div>
          </div>
        ) : (
          <button
            className="flex items-center gap-2"
            style={{ fontSize: 13, color: "var(--indigo)", padding: "8px 0", background: "none", border: "none", cursor: "pointer" }}
            onClick={() => setAdding(true)}
          >
            <Plus style={{ width: 14, height: 14 }} /> Státusz hozzáadása
          </button>
        )}
      </div>
    </div>
  );
}
