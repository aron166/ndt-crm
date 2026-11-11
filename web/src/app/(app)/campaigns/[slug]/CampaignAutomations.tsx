"use client";
// Kampány > Automatizálás (item 5): the automation rules scoped to THIS campaign, on the existing
// engine (trigger_config.campaignId). Safe internal actions by default; send_email and webhook_out
// only while the campaign's outbound switch is on (Áron's, part of the approval hash). Seeds nothing.
// Hungarian copy is PROPOSAL until Áron approves it.

import { useState } from "react";
import { useRouter } from "next/navigation";
import k from "@/components/astryx/page.module.css";
import { createAutomation, deleteAutomation, toggleAutomation } from "@/app/actions/automations";
import s from "../campaigns.module.css";

export interface CampaignRule {
  id: number; name: string; isActive: boolean; triggerType: string; actionType: string;
  triggerConfig: Record<string, unknown> | null; actionConfig: Record<string, unknown>; lastRunAt: string | null;
}

export const CAMPAIGN_TRIGGER_LABEL: Record<string, string> = {
  campaign_member_replied: "Egy tag válaszolt",
  campaign_member_promoted: "Egy tagból lead lett",
  campaign_call_outcome: "Hívás eredményt rögzítettek",
  campaign_step_completed: "Egy tag végzett egy lépéssel",
};
const OUTCOME_LABEL: Record<string, string> = {
  no_answer: "Nem vették fel", interested: "Érdeklődik", wants: "Kéri / akarja", not_interested: "Nem érdekli", bad_number: "Rossz szám",
};
const ACTION_LABEL: Record<string, string> = {
  create_task: "Feladat létrehozása", change_lead_status: "Lead státusz léptetése", assign_lead: "Lead felelőse", add_note: "Jegyzet a cégre",
  send_email: "E-mail küldése (kimenő)", webhook_out: "Webhook (kimenő)",
};
const SAFE = ["create_task", "change_lead_status", "assign_lead", "add_note"];
const OUTBOUND = ["send_email", "webhook_out"];

function describe(r: CampaignRule): string {
  const out = r.triggerType === "campaign_call_outcome" && typeof r.triggerConfig?.outcome === "string" ? `: ${OUTCOME_LABEL[r.triggerConfig.outcome] ?? r.triggerConfig.outcome}` : "";
  return `${CAMPAIGN_TRIGGER_LABEL[r.triggerType] ?? r.triggerType}${out} → ${ACTION_LABEL[r.actionType] ?? r.actionType}`;
}

export function CampaignAutomations({ campaignId, rules, outbound, leadStatuses, users }: {
  campaignId: number; rules: CampaignRule[]; outbound: boolean;
  leadStatuses: { key: string; label: string }[]; users: { id: number; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState("campaign_member_replied");
  const [outcome, setOutcome] = useState("");
  const [action, setAction] = useState("create_task");
  const [text, setText] = useState("");
  const [status, setStatus] = useState("");
  const [user, setUser] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const actions = outbound ? [...SAFE, ...OUTBOUND] : SAFE;

  async function run(fn: () => Promise<{ success?: boolean; error?: string }>, done: string) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fn();
      if (r.error) setMsg({ ok: false, text: r.error });
      else { setMsg({ ok: true, text: done }); router.refresh(); }
      return !r.error;
    } catch {
      setMsg({ ok: false, text: "Hálózati hiba, próbáld újra" });
      return false;
    } finally {
      setBusy(false);
    }
  }

  function config(): Record<string, unknown> {
    if (action === "create_task") return { titleTemplate: text, type: "call", dueInDays: 1 };
    if (action === "add_note") return { textTemplate: text };
    if (action === "change_lead_status") return { toStatus: status };
    if (action === "assign_lead") return { assignedToId: Number(user) };
    if (action === "webhook_out") return { url: text };
    return { subjectTemplate: name, bodyTemplate: text, sendOnce: true };
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const f = new FormData();
    f.set("name", name);
    f.set("triggerType", trigger);
    f.set("actionType", action);
    f.set("triggerConfig", JSON.stringify({ campaignId, ...(trigger === "campaign_call_outcome" && outcome ? { outcome } : {}) }));
    f.set("actionConfig", JSON.stringify(config()));
    if (await run(() => createAutomation(f), "Szabály mentve")) { setOpen(false); setName(""); setText(""); }
  }

  return (
    <section className={k.section} aria-label="Automatizálás">
      <div className={k.groupHead}>
        <h2 className={k.groupTitle}>Automatizálás</h2>
        {!open && <button type="button" className={k.btn} onClick={() => setOpen(true)}>Új szabály</button>}
      </div>
      <p className={k.muted}>
        Csak ennek a kampánynak az eseményeire futnak. Belső műveletek: feladat, lead státusz, felelős, jegyzet.
        {outbound ? " A kimenő automatizmus be van kapcsolva (Áron): e-mail és webhook is választható." : " Kimenő művelet (e-mail, webhook) csak akkor, ha Áron bekapcsolja a kampány kimenő automatizmusát."}
        {" "}Telegram értesítés művelet még nincs a rendszerben. Megnyitás (opened) esemény nincs: nem mérjük.
      </p>
      {rules.length === 0 ? (
        <p className={k.muted}>Nincs szabály ehhez a kampányhoz.</p>
      ) : (
        <ul className={s.ruleList}>
          {rules.map((r) => {
            const inert = OUTBOUND.includes(r.actionType) && !outbound;
            return (
              <li key={r.id} className={k.kv}>
                <span>
                  <span className={k.strong}>{r.name}</span>
                  <span className={k.muted}> {describe(r)}{inert ? " (nem fut: a kimenő automatizmus ki van kapcsolva)" : ""}{r.lastRunAt ? `, utoljára ${r.lastRunAt.slice(0, 10)}` : ""}</span>
                </span>
                <span className={k.actions}>
                  <button type="button" className={k.btn} disabled={busy} onClick={() => run(() => toggleAutomation(r.id, !r.isActive), r.isActive ? "Kikapcsolva" : "Bekapcsolva")}>{r.isActive ? "Kikapcsolás" : "Bekapcsolás"}</button>
                  <button type="button" className={k.btn} disabled={busy} onClick={() => run(() => deleteAutomation(r.id), "Törölve")}>Törlés</button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {open && (
        <form onSubmit={create} className={s.ruleForm} aria-label="Új kampány szabály">
          <label className={s.field}><span>Név</span><input className={s.input} value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} /></label>
          <label className={s.field}><span>Amikor</span>
            <select className={s.input} value={trigger} onChange={(e) => setTrigger(e.target.value)}>
              {Object.entries(CAMPAIGN_TRIGGER_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          {trigger === "campaign_call_outcome" && (
            <label className={s.field}><span>Eredmény</span>
              <select className={s.input} value={outcome} onChange={(e) => setOutcome(e.target.value)}>
                <option value="">Bármelyik</option>
                {Object.entries(OUTCOME_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
          )}
          <label className={s.field}><span>Akkor</span>
            <select className={s.input} value={action} onChange={(e) => setAction(e.target.value)}>
              {actions.map((a) => <option key={a} value={a}>{ACTION_LABEL[a]}</option>)}
            </select>
          </label>
          {action === "change_lead_status" ? (
            <label className={s.field}><span>Célstátusz</span>
              <select className={s.input} value={status} onChange={(e) => setStatus(e.target.value)} required>
                <option value="">Válassz</option>
                {leadStatuses.filter((x) => x.key !== "won").map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
              </select>
            </label>
          ) : action === "assign_lead" ? (
            <label className={s.field}><span>Felelős</span>
              <select className={s.input} value={user} onChange={(e) => setUser(e.target.value)} required>
                <option value="">Válassz</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </label>
          ) : (
            <label className={s.field}>
              <span>{action === "create_task" ? "Feladat címe ({company} beírható)" : action === "add_note" ? "Jegyzet ({company}, {outcome} beírható)" : action === "webhook_out" ? "https webhook URL" : "E-mail szövege"}</span>
              <input className={s.input} value={text} onChange={(e) => setText(e.target.value)} required maxLength={2000} />
            </label>
          )}
          <div className={k.actions}>
            <button type="submit" className={`${k.btn} ${k.btnPrimary}`} disabled={busy}>Mentés</button>
            <button type="button" className={k.btn} disabled={busy} onClick={() => setOpen(false)}>Mégse</button>
          </div>
        </form>
      )}
      {msg && <p className={msg.ok ? s.ok : s.err} role="status">{msg.text}</p>}
    </section>
  );
}
