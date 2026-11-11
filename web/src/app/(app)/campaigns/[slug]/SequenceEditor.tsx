"use client";
// Sequence editor (item 4): add, remove and reorder steps; kinds e-mail, call and a wait in working
// days; a condition per touch from a small fixed set; each touch links its asset from the content
// approval pipeline. The server re-checks the order rule (e-mail first for prospect audiences).
// Hungarian copy is PROPOSAL until Áron approves it.

import k from "@/components/astryx/page.module.css";
import { assetStateLabel, type SeqRow } from "@/lib/campaigns/labels";
import type { AssetState } from "@/lib/campaigns/hub";
import s from "../campaigns.module.css";

export const CONDITION_LABEL: Record<string, string> = {
  all: "mindenkinek",
  no_reply: "akik még nem válaszoltak",
  replied: "akik válaszoltak (hívás a válaszolóknak)",
  no_answer: "akik nem vették fel az előző hívást",
};
const KIND_LABEL = { email: "E-mail", call: "Hívás", wait: "Várakozás" } as const;

export function SequenceEditor({ rows, onChange, touchKinds, assets, emailFirst }: {
  rows: SeqRow[]; onChange: (r: SeqRow[]) => void; touchKinds: ("email" | "call")[]; assets: AssetState[];
  /** Prospect audiences: the first touch must be the e-mail (Áron's order). */
  emailFirst: boolean;
}) {
  const set = (i: number, r: SeqRow) => onChange(rows.map((x, j) => (j === i ? r : x)));
  const move = (i: number, by: -1 | 1) => {
    const j = i + by;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const firstTouch = rows.find((r) => r.kind !== "wait");
  const orderWarning = emailFirst && firstTouch && firstTouch.kind !== "email" ? "Prospekteknél az első lépés az e-mail; hívás csak utána jöhet." : null;
  let n = 0;

  return (
    <div>
      <ol className={s.steps} aria-label="Sorozat lépései">
        {rows.map((r, i) => {
          const label = r.kind === "wait" ? "várakozás" : `${++n}. lépés`;
          return (
            <li key={i} className={s.step} data-kind={r.kind}>
              <span className={s.stepNo}>{r.kind === "wait" ? "" : n}</span>
              <div className={s.stepEdit}>
                <span className={k.strong}>{KIND_LABEL[r.kind]}</span>
                {r.kind === "wait" ? (
                  <label className={k.muted}>
                    <input aria-label={`${i + 1}. sor várakozás munkanapban`} className={`${s.input} ${s.metric}`} type="number" min={1} max={60}
                      value={r.days} onChange={(e) => set(i, { kind: "wait", days: Math.max(1, Math.min(60, Number(e.target.value) || 1)) })} />
                    {" "}munkanap (hétvége nem számít)
                  </label>
                ) : (
                  <>
                    <select aria-label={`${label} kinek`} className={s.input} value={r.condition} onChange={(e) => set(i, { ...r, condition: e.target.value as typeof r.condition })}>
                      {Object.entries(CONDITION_LABEL).filter(([v]) => v !== "no_answer" || rows.slice(0, i).some((x) => x.kind === "call")).filter(([v]) => v !== "replied" || r.kind === "call").map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                    <select aria-label={`${label} anyaga`} className={s.input} value={r.content_item_id ?? ""} onChange={(e) => set(i, { ...r, content_item_id: e.target.value ? Number(e.target.value) : null })}>
                      <option value="">nincs anyag</option>
                      {assets.map((a) => <option key={a.id} value={a.id}>{a.title}{a.version ? ` v${a.version}` : ""} ({assetStateLabel(a.status)})</option>)}
                    </select>
                  </>
                )}
              </div>
              <span className={k.actions}>
                <button type="button" className={k.btn} aria-label={`${i + 1}. sor feljebb`} disabled={i === 0} onClick={() => move(i, -1)}>Fel</button>
                <button type="button" className={k.btn} aria-label={`${i + 1}. sor lejjebb`} disabled={i === rows.length - 1} onClick={() => move(i, 1)}>Le</button>
                <button type="button" className={k.btn} aria-label={`${i + 1}. sor törlése`} onClick={() => onChange(rows.filter((_, j) => j !== i))}>Törlés</button>
              </span>
            </li>
          );
        })}
      </ol>
      <div className={k.actions} style={{ marginTop: 12 }}>
        {touchKinds.map((t) => (
          <button key={t} type="button" className={k.btn} disabled={rows.length >= 40}
            onClick={() => onChange([...rows, { kind: t, condition: rows.some((x) => x.kind !== "wait") ? "no_reply" : "all", content_item_id: null }])}>
            + {KIND_LABEL[t]}
          </button>
        ))}
        <button type="button" className={k.btn} disabled={rows.length >= 40} onClick={() => onChange([...rows, { kind: "wait", days: 2 }])}>+ Várakozás</button>
      </div>
      <p className={k.muted}>Feltételek: mindenkinek, még nem válaszolt, válaszolt, az előző hívást nem vették fel. Megnyitás (opened) feltétel nincs: a megnyitásokat nem mérjük. Egy válasz leállítja a további e-maileket.</p>
      {orderWarning && <p className={s.err} role="alert">{orderWarning}</p>}
    </div>
  );
}
