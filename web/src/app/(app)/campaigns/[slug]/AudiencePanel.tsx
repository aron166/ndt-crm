"use client";
// Közönség (item 4): prospects from a list (the member load on Tagok) or open leads in chosen stages
// (retargeting, nurture). Changing it on a running campaign sends it back to draft (service).
// Also the e-mail step's daily drafts: into the Outreach queue, never sent from here.
// Hungarian copy is PROPOSAL until Áron approves it.

import { useState } from "react";
import { useRouter } from "next/navigation";
import k from "@/components/astryx/page.module.css";
import { draftEmailStepAction, loadLeadAudienceAction, updateCampaignAction } from "@/app/actions/campaign-hub";
import s from "../campaigns.module.css";

type Source = "prospect_list" | "leads_by_stage";

export function AudiencePanel({ slug, status, source, stages, leadStatuses, canOperate, hasEmailStep }: {
  slug: string; status: string; source: Source; stages: string[]; leadStatuses: { key: string; label: string }[];
  canOperate: boolean; hasEmailStep: boolean;
}) {
  const router = useRouter();
  const [src, setSrc] = useState<Source>(source);
  const [picked, setPicked] = useState<string[]>(stages);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [plan, setPlan] = useState<Record<string, number> | null>(null);
  const [batch] = useState(() => `leads-${new Date().toISOString().slice(0, 10)}-${Math.random().toString(36).slice(2, 6)}`);
  const closed = status === "stopped" || status === "done";
  const dirty = src !== source || (src === "leads_by_stage" && picked.slice().sort().join() !== stages.slice().sort().join());

  async function run<T extends { error?: string }>(fn: () => Promise<T>, ok: (r: T) => string) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fn();
      if ("error" in r && r.error) setMsg({ ok: false, text: r.error });
      else { setMsg({ ok: true, text: ok(r) }); router.refresh(); }
      return r;
    } catch {
      setMsg({ ok: false, text: "Hálózati hiba, próbáld újra" });
      return null;
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={k.section} aria-label="Közönség">
      <h2 className={k.groupTitle}>Közönség</h2>
      <div role="radiogroup" aria-label="Közönség forrása" className={s.field}>
        <label><input type="radio" name="aud" checked={src === "prospect_list"} disabled={closed || busy} onChange={() => setSrc("prospect_list")} /> Prospektek listából (Tagok, fájl betöltése)</label>
        <label><input type="radio" name="aud" checked={src === "leads_by_stage"} disabled={closed || busy} onChange={() => setSrc("leads_by_stage")} /> Leadek szakasz szerint (újracélzás, gondozás)</label>
      </div>
      {src === "leads_by_stage" && (
        <fieldset className={s.stageSet} disabled={closed || busy}>
          <legend className={k.muted}>Mely szakaszok nyitott leadjei</legend>
          {leadStatuses.filter((x) => x.key !== "won" && x.key !== "lost").map((x) => (
            <label key={x.key}><input type="checkbox" checked={picked.includes(x.key)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, x.key] : p.filter((y) => y !== x.key)))} /> {x.label}</label>
          ))}
        </fieldset>
      )}
      {dirty && !closed && (
        <div className={k.actions}>
          <button type="button" className={`${k.btn} ${k.btnPrimary}`} disabled={busy || (src === "leads_by_stage" && picked.length === 0)}
            onClick={() => run(() => updateCampaignAction(slug, { audience: { source: src, ...(src === "leads_by_stage" ? { stages: picked } : {}) } }) as Promise<{ error?: string }>, () => (status === "draft" ? "Közönség mentve" : "Közönség mentve; a kampány piszkozat, újra jóvá kell hagyni"))}>
            Közönség mentése
          </button>
        </div>
      )}
      {source === "leads_by_stage" && !dirty && !closed && (
        <div className={k.actions}>
          <button type="button" className={k.btn} disabled={busy} onClick={async () => {
            const r = await run(() => loadLeadAudienceAction(slug, batch, true) as Promise<{ error?: string; summary?: Record<string, number> }>, (x) => `Próba: ${x.summary?.add ?? 0} új tag, ${x.summary?.already_member ?? 0} már tag`);
            if (r && "summary" in r && r.summary) setPlan(r.summary);
          }}>Leadek próbabetöltése</button>
          {plan && canOperate && (
            <button type="button" className={`${k.btn} ${k.btnPrimary}`} disabled={busy || !plan.add}
              onClick={() => run(() => loadLeadAudienceAction(slug, batch, false) as Promise<{ error?: string; summary?: Record<string, number> }>, (x) => `Betöltve: ${x.summary?.add ?? 0} tag (${batch})`)}>
              {plan.add} lead betöltése
            </button>
          )}
        </div>
      )}
      {hasEmailStep && status === "running" && canOperate && (
        <div className={k.actions}>
          <button type="button" className={k.btn} disabled={busy}
            onClick={() => run(() => draftEmailStepAction(slug) as Promise<{ error?: string; drafted?: number; noAddress?: number; noAsset?: number }>, (x) => `${x.drafted ?? 0} piszkozat az Outreach sorban (nincs cím: ${x.noAddress ?? 0}, nincs élő anyag: ${x.noAsset ?? 0}). Küldés csak onnan, jóváhagyás után.`)}>
            Mai e-mail lépés piszkozatai
          </button>
        </div>
      )}
      {msg && <p className={msg.ok ? s.ok : s.err} role="status">{msg.text}</p>}
    </section>
  );
}
