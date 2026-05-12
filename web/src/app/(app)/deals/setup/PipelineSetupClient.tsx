"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { upsertStage, deleteStage, createPipeline } from "@/app/actions/deals";
import { Plus, Trash2, GripVertical } from "lucide-react";
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

interface Pipeline {
  id: number; name: string;
  stages: Stage[];
}

interface PipelineSetupClientProps {
  pipelines: Pipeline[];
}

function StageRow({ stage, pipelineId }: { stage: Stage; pipelineId: number }) {
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
        <GripVertical style={{ width: 14, height: 14, color: "var(--fg-faint)", flexShrink: 0 }} />
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

export function PipelineSetupClient({ pipelines }: PipelineSetupClientProps) {
  const router = useRouter();
  const [newPipelineName, setNewPipelineName] = useState("");
  const [addingStage, setAddingStage] = useState<number | null>(null);
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
            {pipeline.stages.map((stage) => (
              <StageRow key={stage.id} stage={stage} pipelineId={pipeline.id} />
            ))}

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
