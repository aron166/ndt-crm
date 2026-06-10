"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Pencil, Zap, X } from "lucide-react";
import {
  createAutomation, updateAutomation, toggleAutomation, deleteAutomation,
} from "@/app/actions/automations";

// ── Static option sets (Hungarian labels) ──────────────────────────

const TRIGGERS = [
  { v: "lead_created", l: "Új lead érkezett" },
  { v: "lead_status_changed", l: "Lead státusz változott" },
  { v: "deal_stage_changed", l: "Deal fázis változott" },
  { v: "deal_idle_in_stage", l: "Deal X napja egy fázisban (időzített)" },
] as const;

const OPS = [
  { v: "eq", l: "egyenlő" },
  { v: "ne", l: "nem egyenlő" },
  { v: "gt", l: "nagyobb mint" },
  { v: "lt", l: "kisebb mint" },
  { v: "contains", l: "tartalmazza" },
  { v: "is_empty", l: "üres" },
  { v: "is_not_empty", l: "nem üres" },
] as const;

const TASK_TYPES = [
  { v: "call", l: "Hívás" },
  { v: "email", l: "Email" },
  { v: "meeting", l: "Találkozó" },
  { v: "document", l: "Dokumentum" },
  { v: "field_visit", l: "Helyszíni" },
  { v: "internal", l: "Belső" },
] as const;

const CATEGORIES = [
  { v: "revenue_generating", l: "Bevételtermelő" },
  { v: "non_revenue", l: "Nem bevételtermelő" },
] as const;

const LEAD_FIELDS = [
  { key: "source", label: "Csatorna" },
  { key: "serviceInterest", label: "Szolgáltatás" },
  { key: "estimatedValue", label: "Becsült érték" },
  { key: "message", label: "Üzenet" },
  { key: "sourceApp", label: "Forrás app" },
  { key: "status", label: "Státusz" },
];
const DEAL_FIELDS = [
  { key: "value", label: "Érték" },
  { key: "stageId", label: "Fázis (ID)" },
];

function fieldsForTrigger(t: string) {
  return t.startsWith("deal") ? DEAL_FIELDS : LEAD_FIELDS;
}

// ── Types ───────────────────────────────────────────────────────────

interface Cond { field: string; op: string; value: string }

interface RuleRow {
  id: number;
  name: string;
  isActive: boolean;
  triggerType: string;
  triggerConfig: unknown;
  conditions: unknown;
  actionType: string;
  actionConfig: unknown;
  lastRunAt: string | Date | null;
}

interface Opt { key: string; label: string }
interface StageOpt { id: number; label: string }

interface FormState {
  name: string;
  triggerType: string;
  toStatus: string;
  toStageId: string;
  stageId: string;
  idleDays: string;
  conditions: Cond[];
  actionType: string;
  titleTemplate: string;
  taskType: string;
  category: string;
  dueInDays: string;
  descriptionTemplate: string;
  subjectTemplate: string;
  bodyTemplate: string;
}

const EMPTY: FormState = {
  name: "",
  triggerType: "lead_created",
  toStatus: "",
  toStageId: "",
  stageId: "",
  idleDays: "7",
  conditions: [],
  actionType: "create_task",
  titleTemplate: "",
  taskType: "call",
  category: "revenue_generating",
  dueInDays: "1",
  descriptionTemplate: "",
  subjectTemplate: "",
  bodyTemplate: "",
};

// ── Shared input styles ─────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "6px 10px", fontSize: 13,
  background: "var(--bg-0)", border: "1px solid var(--line-soft)",
  borderRadius: 6, color: "var(--fg)", outline: "none",
};

function fromRule(r: RuleRow): FormState {
  const tc = (r.triggerConfig ?? {}) as Record<string, unknown>;
  const ac = (r.actionConfig ?? {}) as Record<string, unknown>;
  const conds = Array.isArray(r.conditions)
    ? (r.conditions as Record<string, unknown>[]).map((c) => ({
        field: String(c.field ?? ""), op: String(c.op ?? "eq"),
        value: c.value == null ? "" : String(c.value),
      }))
    : [];
  return {
    name: r.name,
    triggerType: r.triggerType,
    toStatus: tc.toStatus ? String(tc.toStatus) : "",
    toStageId: tc.toStageId != null ? String(tc.toStageId) : "",
    stageId: tc.stageId != null ? String(tc.stageId) : "",
    idleDays: tc.idleDays != null ? String(tc.idleDays) : "7",
    conditions: conds,
    actionType: r.actionType || "create_task",
    titleTemplate: ac.titleTemplate ? String(ac.titleTemplate) : "",
    taskType: ac.type ? String(ac.type) : "call",
    category: ac.category ? String(ac.category) : "revenue_generating",
    dueInDays: ac.dueInDays != null ? String(ac.dueInDays) : "",
    descriptionTemplate: ac.descriptionTemplate ? String(ac.descriptionTemplate) : "",
    subjectTemplate: ac.subjectTemplate ? String(ac.subjectTemplate) : "",
    bodyTemplate: ac.bodyTemplate ? String(ac.bodyTemplate) : "",
  };
}

export function AutomationsClient({
  rules, leadStatuses, stages,
}: {
  rules: RuleRow[];
  leadStatuses: Opt[];
  stages: StageOpt[];
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function openCreate() {
    setForm(EMPTY); setEditingId(null); setError(null); setShowForm(true);
  }
  function openEdit(r: RuleRow) {
    setForm(fromRule(r)); setEditingId(r.id); setError(null); setShowForm(true);
  }
  function closeForm() {
    setShowForm(false); setEditingId(null); setError(null); setForm(EMPTY);
  }

  function buildTriggerConfig(): Record<string, unknown> {
    switch (form.triggerType) {
      case "lead_status_changed":
        return form.toStatus ? { toStatus: form.toStatus } : {};
      case "deal_stage_changed":
        return form.toStageId ? { toStageId: Number(form.toStageId) } : {};
      case "deal_idle_in_stage":
        return {
          ...(form.stageId ? { stageId: Number(form.stageId) } : {}),
          idleDays: Number(form.idleDays) || 0,
        };
      default:
        return {};
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError("Név kötelező"); return; }
    const isEmail = form.actionType === "send_email";
    if (isEmail) {
      if (!form.subjectTemplate.trim()) { setError("Az email tárgya kötelező"); return; }
      if (!form.bodyTemplate.trim()) { setError("Az email szövege kötelező"); return; }
    } else if (!form.titleTemplate.trim()) {
      setError("A létrehozandó feladat címe kötelező"); return;
    }

    const data = new FormData();
    data.set("name", form.name.trim());
    data.set("triggerType", form.triggerType);
    data.set("actionType", form.actionType);
    data.set("triggerConfig", JSON.stringify(buildTriggerConfig()));
    const conds = form.conditions
      .filter((c) => c.field && c.op)
      .map((c) => ({ field: c.field, op: c.op, value: c.value }));
    data.set("conditions", JSON.stringify(conds));
    data.set("actionConfig", JSON.stringify(isEmail
      ? {
          subjectTemplate: form.subjectTemplate.trim(),
          bodyTemplate: form.bodyTemplate.trim(),
        }
      : {
          titleTemplate: form.titleTemplate.trim(),
          type: form.taskType || undefined,
          category: form.category || undefined,
          dueInDays: form.dueInDays !== "" ? Number(form.dueInDays) : undefined,
          descriptionTemplate: form.descriptionTemplate.trim() || undefined,
        }));

    startTransition(async () => {
      const res = editingId
        ? await updateAutomation(editingId, data)
        : await createAutomation(data);
      if (res && "error" in res) { setError(res.error); return; }
      closeForm();
      router.refresh();
    });
  }

  function handleToggle(r: RuleRow) {
    startTransition(async () => {
      const res = await toggleAutomation(r.id, !r.isActive);
      if (res && "error" in res && res.error) { setError(res.error); return; }
      router.refresh();
    });
  }
  function handleDelete(id: number) {
    if (!confirm("Biztosan törlöd ezt a szabályt?")) return;
    startTransition(async () => {
      const res = await deleteAutomation(id);
      if (res && "error" in res && res.error) { setError(res.error); return; }
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <div className="page-head">
        <div>
          <h1 className="page-title">Automatizálások</h1>
          <p className="page-sub">
            Szabályok: ha egy esemény bekövetkezik, automatikusan létrejön egy feladat.
          </p>
        </div>
        <div className="page-actions">
          {!showForm && (
            <button onClick={openCreate} className="btn primary" style={{ gap: 6 }}>
              <Plus style={{ width: 14, height: 14 }} /> Új szabály
            </button>
          )}
        </div>
      </div>

      {error && !showForm && (
        <div className="panel"><div className="panel-pad" style={{ fontSize: 13, color: "var(--coral)" }}>{error}</div></div>
      )}

      {showForm && (
        <RuleForm
          form={form} set={set} stages={stages} leadStatuses={leadStatuses}
          editing={editingId != null} error={error} pending={pending}
          onSubmit={handleSubmit} onCancel={closeForm}
          addCondition={() => set("conditions", [...form.conditions, { field: fieldsForTrigger(form.triggerType)[0].key, op: "eq", value: "" }])}
          updateCondition={(i, patch) => set("conditions", form.conditions.map((c, idx) => idx === i ? { ...c, ...patch } : c))}
          removeCondition={(i) => set("conditions", form.conditions.filter((_, idx) => idx !== i))}
        />
      )}

      {/* Rule list */}
      {rules.length === 0 ? (
        <div className="panel"><div className="panel-pad" style={{ fontSize: 13, color: "var(--fg-mute)" }}>
          Még nincs automatizálási szabály. Hozz létre egyet a fenti gombbal.
        </div></div>
      ) : (
        <div className="space-y-2">
          {rules.map((r) => (
            <RuleCard
              key={r.id} rule={r} leadStatuses={leadStatuses} stages={stages}
              pending={pending} onToggle={() => handleToggle(r)}
              onEdit={() => openEdit(r)} onDelete={() => handleDelete(r.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Rule list card ──────────────────────────────────────────────────

function describeTrigger(r: RuleRow, leadStatuses: Opt[], stages: StageOpt[]): string {
  const tc = (r.triggerConfig ?? {}) as Record<string, unknown>;
  const base = TRIGGERS.find((t) => t.v === r.triggerType)?.l ?? r.triggerType;
  if (r.triggerType === "lead_status_changed" && tc.toStatus) {
    const s = leadStatuses.find((x) => x.key === tc.toStatus);
    return `${base} → ${s?.label ?? tc.toStatus}`;
  }
  if (r.triggerType === "deal_stage_changed" && tc.toStageId != null) {
    const s = stages.find((x) => x.id === Number(tc.toStageId));
    return `${base} → ${s?.label ?? tc.toStageId}`;
  }
  if (r.triggerType === "deal_idle_in_stage") {
    return `${base} (${tc.idleDays ?? "?"} nap)`;
  }
  return base;
}

function RuleCard({
  rule, leadStatuses, stages, pending, onToggle, onEdit, onDelete,
}: {
  rule: RuleRow; leadStatuses: Opt[]; stages: StageOpt[]; pending: boolean;
  onToggle: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const ac = (rule.actionConfig ?? {}) as Record<string, unknown>;
  const isEmail = rule.actionType === "send_email";
  const actionSummary = isEmail
    ? `email: „${(ac.subjectTemplate as string | undefined) ?? "—"}”`
    : `feladat: „${(ac.titleTemplate as string | undefined) ?? "—"}”`;
  const condCount = Array.isArray(rule.conditions) ? rule.conditions.length : 0;
  return (
    <div className="panel" style={{ opacity: rule.isActive ? 1 : 0.6 }}>
      <div className="panel-pad flex items-center justify-between" style={{ gap: 12 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="flex items-center gap-2" style={{ marginBottom: 3 }}>
            <Zap style={{ width: 14, height: 14, color: rule.isActive ? "var(--indigo)" : "var(--fg-faint)" }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--fg)" }}>{rule.name}</span>
            {!rule.isActive && <span style={{ fontSize: 10, color: "var(--fg-faint)" }}>inaktív</span>}
          </div>
          <div style={{ fontSize: 12, color: "var(--fg-mute)" }}>
            {describeTrigger(rule, leadStatuses, stages)}
            {condCount > 0 && <span style={{ color: "var(--fg-faint)" }}> · {condCount} feltétel</span>}
            <span style={{ color: "var(--fg-faint)" }}> → {actionSummary}</span>
          </div>
        </div>
        <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
          <label className="flex items-center gap-1.5" style={{ fontSize: 11, color: "var(--fg-mute)", cursor: "pointer" }}>
            <input type="checkbox" checked={rule.isActive} onChange={onToggle} disabled={pending} />
            aktív
          </label>
          <button onClick={onEdit} disabled={pending} title="Szerkesztés" className="btn" style={{ padding: "4px 8px" }}>
            <Pencil style={{ width: 13, height: 13 }} />
          </button>
          <button onClick={onDelete} disabled={pending} title="Törlés"
            style={{ background: "transparent", border: "1px solid var(--line-soft)", borderRadius: 5, padding: "4px 8px", color: "var(--coral)", cursor: "pointer", display: "flex" }}>
            <Trash2 style={{ width: 13, height: 13 }} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Builder form ────────────────────────────────────────────────────

function RuleForm({
  form, set, stages, leadStatuses, editing, error, pending, onSubmit, onCancel,
  addCondition, updateCondition, removeCondition,
}: {
  form: FormState;
  set: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  stages: StageOpt[]; leadStatuses: Opt[];
  editing: boolean; error: string | null; pending: boolean;
  onSubmit: (e: React.FormEvent) => void; onCancel: () => void;
  addCondition: () => void;
  updateCondition: (i: number, patch: Partial<Cond>) => void;
  removeCondition: (i: number) => void;
}) {
  const condFields = fieldsForTrigger(form.triggerType);
  return (
    <form onSubmit={onSubmit} className="panel">
      <div className="panel-head"><div className="panel-title">{editing ? "Szabály szerkesztése" : "Új szabály"}</div></div>
      <div className="panel-pad space-y-4">
        <div>
          <label className="field-label">Név</label>
          <input style={inputStyle} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="pl. Új lead → megkeresési feladat" autoFocus />
        </div>

        {/* Trigger */}
        <div style={{ borderTop: "1px solid var(--line-soft)", paddingTop: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--fg-faint)", marginBottom: 10 }}>Trigger — amikor…</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Esemény</label>
              <select style={inputStyle} value={form.triggerType} onChange={(e) => { set("triggerType", e.target.value); set("conditions", []); }}>
                {TRIGGERS.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
              </select>
            </div>

            {form.triggerType === "lead_status_changed" && (
              <div>
                <label className="field-label">Célállapot (üres = bármelyik)</label>
                <select style={inputStyle} value={form.toStatus} onChange={(e) => set("toStatus", e.target.value)}>
                  <option value="">Bármelyik státusz</option>
                  {leadStatuses.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </div>
            )}

            {form.triggerType === "deal_stage_changed" && (
              <div>
                <label className="field-label">Célfázis (üres = bármelyik)</label>
                <select style={inputStyle} value={form.toStageId} onChange={(e) => set("toStageId", e.target.value)}>
                  <option value="">Bármelyik fázis</option>
                  {stages.map((s) => <option key={s.id} value={String(s.id)}>{s.label}</option>)}
                </select>
              </div>
            )}

            {form.triggerType === "deal_idle_in_stage" && (
              <>
                <div>
                  <label className="field-label">Fázis (üres = bármelyik)</label>
                  <select style={inputStyle} value={form.stageId} onChange={(e) => set("stageId", e.target.value)}>
                    <option value="">Bármelyik fázis</option>
                    {stages.map((s) => <option key={s.id} value={String(s.id)}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="field-label">Tétlen napok száma</label>
                  <input type="number" min={1} style={inputStyle} value={form.idleDays} onChange={(e) => set("idleDays", e.target.value)} />
                </div>
              </>
            )}
          </div>
          {form.triggerType === "deal_idle_in_stage" && (
            <p style={{ fontSize: 11, color: "var(--fg-faint)", marginTop: 6 }}>
              Az időzített triggert egy ütemezett feladat értékeli ki (hamarosan). A szabály már most menthető.
            </p>
          )}
        </div>

        {/* Conditions */}
        <div style={{ borderTop: "1px solid var(--line-soft)", paddingTop: 12 }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--fg-faint)" }}>Feltételek (opcionális, ÉS kapcsolat)</div>
            <button type="button" onClick={addCondition} className="btn" style={{ gap: 5, padding: "3px 8px", fontSize: 11 }}>
              <Plus style={{ width: 12, height: 12 }} /> Feltétel
            </button>
          </div>
          {form.conditions.length === 0 ? (
            <p style={{ fontSize: 12, color: "var(--fg-faint)" }}>Nincs feltétel — a szabály minden ilyen eseményre lefut.</p>
          ) : (
            <div className="space-y-2">
              {form.conditions.map((c, i) => {
                const noValue = c.op === "is_empty" || c.op === "is_not_empty";
                return (
                  <div key={i} className="flex items-center gap-2">
                    <select style={{ ...inputStyle, flex: 1 }} value={c.field} onChange={(e) => updateCondition(i, { field: e.target.value })}>
                      {condFields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                    </select>
                    <select style={{ ...inputStyle, width: 130 }} value={c.op} onChange={(e) => updateCondition(i, { op: e.target.value })}>
                      {OPS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                    </select>
                    <input style={{ ...inputStyle, flex: 1, opacity: noValue ? 0.4 : 1 }} value={c.value} disabled={noValue}
                      onChange={(e) => updateCondition(i, { value: e.target.value })} placeholder={noValue ? "—" : "érték"} />
                    <button type="button" onClick={() => removeCondition(i)} title="Törlés"
                      style={{ background: "transparent", border: "none", color: "var(--fg-faint)", cursor: "pointer", display: "flex", flexShrink: 0 }}>
                      <X style={{ width: 14, height: 14 }} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Action */}
        <div style={{ borderTop: "1px solid var(--line-soft)", paddingTop: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--fg-faint)", marginBottom: 10 }}>Művelet</div>
          <div className="space-y-3">
            <div>
              <label className="field-label">Művelet típusa</label>
              <select style={inputStyle} value={form.actionType} onChange={(e) => set("actionType", e.target.value)}>
                <option value="create_task">Feladat létrehozása</option>
                <option value="send_email">Email küldése</option>
              </select>
            </div>

            {form.actionType === "send_email" ? (
              <>
                <div>
                  <label className="field-label">Tárgy</label>
                  <input style={inputStyle} value={form.subjectTemplate} onChange={(e) => set("subjectTemplate", e.target.value)} placeholder="pl. Ajánlatunk — {company}" />
                </div>
                <div>
                  <label className="field-label">Üzenet</label>
                  <textarea style={{ ...inputStyle, minHeight: 120, resize: "vertical" }} value={form.bodyTemplate} onChange={(e) => set("bodyTemplate", e.target.value)} placeholder={"Tisztelt Cím!\n\n..."} />
                </div>
                <p style={{ fontSize: 11, color: "var(--fg-faint)" }}>
                  Helyettesíthető: {"{company}"}, {"{message}"}, {"{sourceApp}"}. A címzettet a lead/cég
                  kapcsolattartójának emailje adja. A Resend integrációnak beállítva kell lennie.
                </p>
              </>
            ) : (
              <>
                <div>
                  <label className="field-label">Feladat címe</label>
                  <input style={inputStyle} value={form.titleTemplate} onChange={(e) => set("titleTemplate", e.target.value)} placeholder="pl. Lead megkeresése: {company}" />
                  <p style={{ fontSize: 11, color: "var(--fg-faint)", marginTop: 4 }}>Helyettesíthető: {"{company}"}, {"{message}"}, {"{sourceApp}"}</p>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="field-label">Típus</label>
                    <select style={inputStyle} value={form.taskType} onChange={(e) => set("taskType", e.target.value)}>
                      {TASK_TYPES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="field-label">Kategória</label>
                    <select style={inputStyle} value={form.category} onChange={(e) => set("category", e.target.value)}>
                      {CATEGORIES.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="field-label">Határidő (nap múlva)</label>
                    <input type="number" min={0} style={inputStyle} value={form.dueInDays} onChange={(e) => set("dueInDays", e.target.value)} placeholder="pl. 1" />
                  </div>
                </div>
                <div>
                  <label className="field-label">Leírás (opcionális)</label>
                  <input style={inputStyle} value={form.descriptionTemplate} onChange={(e) => set("descriptionTemplate", e.target.value)} placeholder="pl. Új lead a(z) {sourceApp} csatornán." />
                </div>
              </>
            )}
          </div>
        </div>

        {error && <p className="text-sm" style={{ color: "var(--coral)" }}>{error}</p>}

        <div className="flex justify-end gap-2" style={{ borderTop: "1px solid var(--line-soft)", paddingTop: 12 }}>
          <button type="button" onClick={onCancel} disabled={pending} className="btn">Mégse</button>
          <button type="submit" disabled={pending} className="btn primary">
            {pending ? "Mentés…" : editing ? "Mentés" : "Létrehozás"}
          </button>
        </div>
      </div>
    </form>
  );
}
