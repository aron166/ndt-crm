"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { upsertStage, deleteStage, createPipeline, reorderStages } from "@/app/actions/deals";
import { upsertCustomField, deleteCustomField } from "@/app/actions/custom-fields";
import { Plus, Trash2, GripVertical, ChevronDown, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const STAGE_COLORS = [
  "#64748b", "#6366f1", "#8b5cf6", "#3b82f6",
  "#06b6d4", "#22c55e", "#f97316", "#f59e0b",
  "#ef4444", "#f43f5e",
];

interface Stage {
  id: number; name: string; color: string;
  probability: number; position: number;
  isTerminalWon: boolean; isTerminalLost: boolean;
}

const FIELD_TYPES = [
  { value: "text",          label: "Szöveg" },
  { value: "number",        label: "Szám" },
  { value: "date",          label: "Dátum" },
  { value: "single_select", label: "Választó (egy)" },
  { value: "multi_select",  label: "Választó (több)" },
];

interface CustomField {
  id: number; key: string; label: string; type: string;
  required: boolean; position: number; options: unknown;
}

interface Pipeline {
  id: number; name: string;
  stages: Stage[];
  customFields: CustomField[];
}

interface PipelineSetupClientProps {
  pipelines: Pipeline[];
}

function StageRow({
  stage,
  pipelineId,
  dragHandle,
}: {
  stage: Stage;
  pipelineId: number;
  dragHandle?: React.HTMLAttributes<HTMLSpanElement> & { draggable?: boolean };
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(stage.name);
  const [color, setColor] = useState(stage.color);
  const [probability, setProbability] = useState(stage.probability);
  const [isTerminalWon, setIsTerminalWon] = useState(stage.isTerminalWon);
  const [isTerminalLost, setIsTerminalLost] = useState(stage.isTerminalLost);
  const [isPending, startTransition] = useTransition();

  function save() {
    const data = new FormData();
    data.set("pipelineId", String(pipelineId));
    data.set("stageId", String(stage.id));
    data.set("name", name);
    data.set("color", color);
    data.set("probability", String(probability));
    data.set("position", String(stage.position));
    data.set("isTerminalWon", String(isTerminalWon));
    data.set("isTerminalLost", String(isTerminalLost));
    startTransition(async () => { await upsertStage(data); setEditing(false); router.refresh(); });
  }

  function handleDelete() {
    if (!confirm(`Törlöd a(z) "${stage.name}" fázist? A benne lévő dealek fázis nélküliek lesznek.`)) return;
    startTransition(async () => { await deleteStage(stage.id); router.refresh(); });
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
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: stage.color, flexShrink: 0, boxShadow: `0 0 6px ${stage.color}` }} />
        <span style={{ flex: 1, fontSize: 13, color: "var(--fg)" }}>{stage.name}</span>
        <span className="font-mono-ndt" style={{ fontSize: 11, color: "var(--fg-mute)" }}>{stage.probability}%</span>
        {stage.isTerminalWon && <span className="badge-ds mint" style={{ fontSize: 10 }}>Nyert</span>}
        {stage.isTerminalLost && <span className="badge-ds coral" style={{ fontSize: 10 }}>Veszített</span>}
        <button onClick={(e) => { e.stopPropagation(); handleDelete(); }}
          style={{ padding: 4, color: "var(--fg-faint)", cursor: "pointer" }}
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
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="field-label">Fázis neve</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="field-label">Valószínűség %</label>
          <Input type="number" value={probability} onChange={(e) => setProbability(parseInt(e.target.value) || 0)} min={0} max={100} />
        </div>
      </div>

      <div>
        <label className="field-label">Szín</label>
        <div className="flex gap-2 flex-wrap">
          {STAGE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              style={{
                width: 24, height: 24, borderRadius: "50%", background: c, cursor: "pointer",
                outline: color === c ? `2px solid ${c}` : "none", outlineOffset: 2,
                boxShadow: color === c ? `0 0 8px ${c}` : "none",
              }}
            />
          ))}
        </div>
      </div>

      <div className="flex gap-4 text-sm" style={{ color: "var(--fg-soft)" }}>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={isTerminalWon} onChange={(e) => { setIsTerminalWon(e.target.checked); if (e.target.checked) setIsTerminalLost(false); setProbability(e.target.checked ? 100 : probability); }} />
          Nyert (lezárt)
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={isTerminalLost} onChange={(e) => { setIsTerminalLost(e.target.checked); if (e.target.checked) setIsTerminalWon(false); setProbability(e.target.checked ? 0 : probability); }} />
          Veszített (lezárt)
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

function StagesList({ stages, pipelineId }: { stages: Stage[]; pipelineId: number }) {
  const router = useRouter();
  const [items, setItems] = useState(stages);
  const [prevStages, setPrevStages] = useState(stages);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  // Re-sync when the server sends a fresh order (after router.refresh()).
  // Render-phase sync — the React-recommended alternative to a setState effect.
  if (prevStages !== stages) {
    setPrevStages(stages);
    setItems(stages);
  }

  function handleDrop() {
    if (dragIndex === null || overIndex === null || dragIndex === overIndex) {
      setDragIndex(null); setOverIndex(null);
      return;
    }
    const next = [...items];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(overIndex, 0, moved);
    setItems(next);
    setDragIndex(null); setOverIndex(null);
    const orderedIds = next.map((s) => s.id);
    startTransition(async () => { await reorderStages(pipelineId, orderedIds); router.refresh(); });
  }

  return (
    <div className="space-y-2">
      {items.map((stage, i) => {
        const showIndicator = dragIndex !== null && overIndex === i && dragIndex !== i;
        return (
          <div
            key={stage.id}
            onDragOver={(e) => { e.preventDefault(); setOverIndex(i); }}
            onDrop={handleDrop}
            style={{
              opacity: dragIndex === i ? 0.4 : 1,
              borderTop: `2px solid ${showIndicator ? "var(--indigo)" : "transparent"}`,
              borderRadius: 2,
              transition: "opacity .15s",
            }}
          >
            <StageRow
              stage={stage}
              pipelineId={pipelineId}
              dragHandle={{
                draggable: true,
                onDragStart: () => setDragIndex(i),
                onDragEnd: () => { setDragIndex(null); setOverIndex(null); },
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

function CustomFieldRow({ field, pipelineId }: { field: CustomField; pipelineId: number }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(field.label);
  const [type, setType] = useState(field.type);
  const [required, setRequired] = useState(field.required);
  const [options, setOptions] = useState(
    Array.isArray(field.options) ? (field.options as string[]).join("\n") : ""
  );
  const [isPending, startTransition] = useTransition();
  const needsOptions = type === "single_select" || type === "multi_select";

  function save() {
    const data = new FormData();
    data.set("pipelineId", String(pipelineId));
    data.set("fieldId", String(field.id));
    data.set("key", field.key);
    data.set("label", label);
    data.set("type", type);
    data.set("required", String(required));
    data.set("position", String(field.position));
    if (needsOptions) data.set("options", options);
    startTransition(async () => { await upsertCustomField(data); setEditing(false); router.refresh(); });
  }

  function handleDelete() {
    if (!confirm(`Törlöd a(z) "${field.label}" mezőt? A mentett értékek elvesznek.`)) return;
    startTransition(async () => { await deleteCustomField(field.id); router.refresh(); });
  }

  if (!editing) {
    return (
      <div
        className="flex items-center gap-3 px-3 py-2 rounded-lg"
        style={{ border: "1px solid var(--line-soft)", background: "var(--bg-panel)", cursor: "pointer" }}
        onClick={() => setEditing(true)}
      >
        <span style={{ fontSize: 10, color: "var(--fg-faint)", fontFamily: "var(--font-mono)", background: "var(--bg-hover)", padding: "1px 6px", borderRadius: 4 }}>
          {field.type}
        </span>
        <span style={{ flex: 1, fontSize: 13, color: "var(--fg)" }}>{field.label}</span>
        <span className="font-mono-ndt" style={{ fontSize: 10, color: "var(--fg-faint)" }}>{field.key}</span>
        {field.required && <span className="badge-ds coral" style={{ fontSize: 9 }}>kötelező</span>}
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
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="field-label">Mező neve</label>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>
        <div>
          <label className="field-label">Típus</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            style={{ width: "100%", padding: "6px 8px", background: "var(--bg-0)", border: "1px solid var(--line-soft)", borderRadius: 6, color: "var(--fg)", fontSize: 13, outline: "none" }}
          >
            {FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      </div>
      {needsOptions && (
        <div>
          <label className="field-label">Opciók (soronként egy)</label>
          <textarea
            value={options}
            onChange={(e) => setOptions(e.target.value)}
            rows={4}
            placeholder={"Opció 1\nOpció 2\nOpció 3"}
            style={{ width: "100%", padding: "6px 8px", background: "var(--bg-0)", border: "1px solid var(--line-soft)", borderRadius: 6, color: "var(--fg)", fontSize: 12, resize: "vertical", outline: "none", fontFamily: "var(--font-mono)" }}
          />
        </div>
      )}
      <label className="flex items-center gap-2 cursor-pointer" style={{ fontSize: 13, color: "var(--fg-soft)" }}>
        <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
        Kötelező mező
      </label>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setEditing(false)}>Mégse</Button>
        <Button type="button" size="sm" className="btn primary" onClick={save} disabled={isPending}>Mentés</Button>
      </div>
    </div>
  );
}

function AddCustomFieldForm({ pipelineId, position, onDone }: { pipelineId: number; position: number; onDone: () => void }) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [type, setType] = useState("text");
  const [options, setOptions] = useState("");
  const [isPending, startTransition] = useTransition();
  const needsOptions = type === "single_select" || type === "multi_select";

  function handleAdd() {
    if (!label.trim()) return;
    const data = new FormData();
    data.set("pipelineId", String(pipelineId));
    data.set("label", label.trim());
    data.set("type", type);
    data.set("required", "false");
    data.set("position", String(position));
    if (needsOptions) data.set("options", options);
    startTransition(async () => { await upsertCustomField(data); setLabel(""); setType("text"); onDone(); router.refresh(); });
  }

  return (
    <div className="rounded-xl p-4 space-y-3" style={{ border: "1px solid var(--indigo-line)", background: "var(--bg-panel)" }}>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="field-label">Mező neve</label>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="pl. NDT módszer" autoFocus
            onKeyDown={(e) => e.key === "Enter" && handleAdd()} />
        </div>
        <div>
          <label className="field-label">Típus</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            style={{ width: "100%", padding: "6px 8px", background: "var(--bg-0)", border: "1px solid var(--line-soft)", borderRadius: 6, color: "var(--fg)", fontSize: 13, outline: "none" }}
          >
            {FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      </div>
      {needsOptions && (
        <div>
          <label className="field-label">Opciók (soronként egy)</label>
          <textarea rows={3} value={options} onChange={(e) => setOptions(e.target.value)}
            placeholder={"UT\nRT\nMT"}
            style={{ width: "100%", padding: "6px 8px", background: "var(--bg-0)", border: "1px solid var(--line-soft)", borderRadius: 6, color: "var(--fg)", fontSize: 12, resize: "vertical", outline: "none", fontFamily: "var(--font-mono)" }} />
        </div>
      )}
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onDone}>Mégse</Button>
        <Button type="button" size="sm" className="btn primary" onClick={handleAdd} disabled={isPending || !label.trim()}>Hozzáadás</Button>
      </div>
    </div>
  );
}

export function PipelineSetupClient({ pipelines }: PipelineSetupClientProps) {
  const router = useRouter();
  const [newPipelineName, setNewPipelineName] = useState("");
  const [addingStage, setAddingStage] = useState<number | null>(null);
  const [addingField, setAddingField] = useState<number | null>(null);
  const [expandedFields, setExpandedFields] = useState<Set<number>>(new Set());
  const [newStageName, setNewStageName] = useState("");
  const [newStageColor, setNewStageColor] = useState("#6366f1");
  const [isPending, startTransition] = useTransition();

  function handleNewPipeline(e: React.FormEvent) {
    e.preventDefault();
    if (!newPipelineName.trim()) return;
    const data = new FormData();
    data.set("name", newPipelineName.trim());
    startTransition(async () => { await createPipeline(data); setNewPipelineName(""); router.refresh(); });
  }

  function handleAddStage(pipelineId: number, position: number) {
    if (!newStageName.trim()) return;
    const data = new FormData();
    data.set("pipelineId", String(pipelineId));
    data.set("name", newStageName.trim());
    data.set("color", newStageColor);
    data.set("probability", "50");
    data.set("position", String(position));
    data.set("isTerminalWon", "false");
    data.set("isTerminalLost", "false");
    startTransition(async () => { await upsertStage(data); setNewStageName(""); setAddingStage(null); router.refresh(); });
  }

  return (
    <div className="space-y-8">
      {pipelines.map((pipeline) => (
        <div key={pipeline.id} className="panel">
          <div className="panel-head">
            <div className="panel-title">{pipeline.name}</div>
            <button
              className="btn sm"
              onClick={() => setAddingStage(pipeline.id)}
            >
              <Plus style={{ width: 12, height: 12 }} /> Fázis hozzáadása
            </button>
          </div>
          <div className="panel-pad space-y-2">
            <StagesList stages={pipeline.stages} pipelineId={pipeline.id} />

            {addingStage === pipeline.id && (
              <div className="rounded-xl p-4 space-y-3" style={{ border: "1px solid var(--indigo-line)", background: "var(--bg-panel)" }}>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="field-label">Fázis neve</label>
                    <Input
                      value={newStageName}
                      onChange={(e) => setNewStageName(e.target.value)}
                      placeholder="pl. Döntéshozó"
                      autoFocus
                      onKeyDown={(e) => e.key === "Enter" && handleAddStage(pipeline.id, pipeline.stages.length)}
                    />
                  </div>
                  <div>
                    <label className="field-label">Szín</label>
                    <div className="flex gap-2 flex-wrap pt-1">
                      {STAGE_COLORS.slice(0, 6).map((c) => (
                        <button key={c} type="button" onClick={() => setNewStageColor(c)}
                          style={{ width: 20, height: 20, borderRadius: "50%", background: c, cursor: "pointer", outline: newStageColor === c ? `2px solid ${c}` : "none", outlineOffset: 2 }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setAddingStage(null)}>Mégse</Button>
                  <Button type="button" size="sm" className="btn primary" onClick={() => handleAddStage(pipeline.id, pipeline.stages.length)} disabled={isPending}>
                    Hozzáadás
                  </Button>
                </div>
              </div>
            )}

            {pipeline.stages.length === 0 && addingStage !== pipeline.id && (
              <p style={{ fontSize: 13, color: "var(--fg-faint)", textAlign: "center", padding: "24px 0" }}>
                Nincs fázis. Adj hozzá egyet a pipeline működéséhez.
              </p>
            )}
          </div>

          {/* Custom fields section */}
          <div style={{ borderTop: "1px solid var(--line-soft)" }}>
            <button
              className="flex items-center gap-2 w-full"
              style={{ padding: "12px 20px", background: "none", border: "none", cursor: "pointer", color: "var(--fg-soft)", fontSize: 13, fontWeight: 500 }}
              onClick={() => setExpandedFields((prev) => {
                const next = new Set(prev);
                next.has(pipeline.id) ? next.delete(pipeline.id) : next.add(pipeline.id);
                return next;
              })}
            >
              {expandedFields.has(pipeline.id)
                ? <ChevronDown style={{ width: 14, height: 14 }} />
                : <ChevronRight style={{ width: 14, height: 14 }} />
              }
              Egyéni mezők
              <span className="font-mono-ndt" style={{ fontSize: 11, color: "var(--fg-faint)", marginLeft: 4 }}>
                {pipeline.customFields.length}
              </span>
            </button>

            {expandedFields.has(pipeline.id) && (
              <div className="panel-pad space-y-2" style={{ paddingTop: 0 }}>
                {pipeline.customFields.map((f) => (
                  <CustomFieldRow key={f.id} field={f} pipelineId={pipeline.id} />
                ))}
                {addingField === pipeline.id ? (
                  <AddCustomFieldForm
                    pipelineId={pipeline.id}
                    position={pipeline.customFields.length}
                    onDone={() => setAddingField(null)}
                  />
                ) : (
                  <button
                    className="flex items-center gap-2"
                    style={{ fontSize: 12, color: "var(--indigo)", padding: "6px 0", background: "none", border: "none", cursor: "pointer" }}
                    onClick={() => setAddingField(pipeline.id)}
                  >
                    <Plus style={{ width: 12, height: 12 }} /> Mező hozzáadása
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      ))}

      {/* New pipeline */}
      <div className="panel">
        <div className="panel-head"><div className="panel-title">Új pipeline</div></div>
        <div className="panel-pad">
          <form onSubmit={handleNewPipeline} className="flex gap-3">
            <Input
              value={newPipelineName}
              onChange={(e) => setNewPipelineName(e.target.value)}
              placeholder="pl. BirdsView Pilots"
              style={{ maxWidth: 300 }}
            />
            <Button type="submit" className="btn primary" disabled={isPending || !newPipelineName.trim()}>
              Létrehozás
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
