"use client";
// Step plan editor, limited to the channels the kind allows. The server re-checks the shape.

import k from "@/components/astryx/page.module.css";
import { CHANNEL_LABEL, channelsFor, type StepDraft } from "@/lib/campaigns/labels";
import type { CampaignKind } from "@/lib/campaigns/rules";
import s from "./campaigns.module.css";

export function StepsEditor({ kind, steps, onChange, assets }: { kind: CampaignKind; steps: StepDraft[]; onChange: (s: StepDraft[]) => void; assets?: { id: number; title: string }[] }) {
  const channels = channelsFor(kind);
  const set = (i: number, patch: Partial<StepDraft>) => onChange(steps.map((st, j) => (j === i ? { ...st, ...patch } : st)));
  return (
    <div>
      <ol className={s.steps}>
        {steps.map((st, i) => (
          <li key={i} className={s.step}>
            <span className={s.stepNo}>{i + 1}</span>
            <div className={s.stepEdit}>
              <select aria-label={`${i + 1}. lépés csatorna`} className={s.input} value={st.channel} onChange={(e) => set(i, { channel: e.target.value as StepDraft["channel"] })}>
                {channels.map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}
              </select>
              <label className={k.muted}>
                várakozás{" "}
                <input aria-label={`${i + 1}. lépés várakozás munkanapban`} className={s.input} style={{ width: 72 }} type="number" min={0} max={60} value={st.wait_days} onChange={(e) => set(i, { wait_days: Math.max(0, Math.min(60, Number(e.target.value) || 0)) })} />
                {" "}munkanap
              </label>
              <select aria-label={`${i + 1}. lépés kinek`} className={s.input} value={st.audience_rule} onChange={(e) => set(i, { audience_rule: e.target.value as StepDraft["audience_rule"] })}>
                <option value="all">mindenkinek</option>
                <option value="no_reply">akik nem válaszoltak</option>
                <option value="no_answer">akik nem vették fel</option>
              </select>
              {assets && (
                <select aria-label={`${i + 1}. lépés anyaga`} className={s.input} value={st.content_item_id ?? ""} onChange={(e) => set(i, { content_item_id: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">nincs anyag</option>
                  {assets.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
                </select>
              )}
            </div>
            <button type="button" className={k.btn} onClick={() => onChange(steps.filter((_, j) => j !== i))} disabled={steps.length <= 1}>Törlés</button>
          </li>
        ))}
      </ol>
      <button type="button" className={k.btn} style={{ marginTop: 12 }} disabled={steps.length >= 20}
        onClick={() => onChange([...steps, { channel: channels[channels.length - 1], wait_days: 3, audience_rule: "all" }])}>
        Lépés hozzáadása
      </button>
      {kind === "sequence" && <p className={k.muted}>Sorozatban az első lépés az e-mail; hívás csak utána jöhet.</p>}
    </div>
  );
}
