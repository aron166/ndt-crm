"use client";
// "Specifikáció AI-val": what an agent proposed through POST /api/campaigns/:slug/specify (app
// key, proposals only) and where each proposed asset is in the content approval pipeline. A
// person adopts the brief or the steps; nobody launches from here.
// Hungarian copy is PROPOSAL until Áron approves it.

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import k from "@/components/astryx/page.module.css";
import { assetStateLabel, stepLine } from "@/lib/campaigns/labels";
import { adoptProposedStepsAction, requestSpecificationAction, updateCampaignAction } from "@/app/actions/campaign-hub";
import type { AssetState } from "@/lib/campaigns/hub";
import s from "../campaigns.module.css";


const BRIEF_LABEL: Record<string, string> = { offer: "Cél, ajánlat", audience: "Célközönség", angle: "Szög" };

export interface Proposal {
  brief?: Record<string, unknown> | null;
  steps?: { channel: string; wait_days?: number; audience_rule?: string }[] | null;
  assets?: { item_id: number; step_position: number | null }[];
  note?: string | null;
  proposed_by?: string;
  proposed_at?: string;
}

/**
 * `editable`: the brief can be adopted (not part of the approval). `canAdoptSteps`: only on a draft
 * with per-member steps, since adopting steps on a running campaign silently resets it (Vanda #189-1, -2).
 */
export function SpecifyPanel({ slug, proposal, assets, editable, canAdoptSteps = false, missing = [], openRequest = false, canRequest = false }: {
  slug: string; proposal: Proposal | null; assets: AssetState[]; editable: boolean; canAdoptSteps?: boolean;
  /** What the campaign still lacks (labels.missingForSpec), prefilled into a request. */
  missing?: string[];
  /** An open specification request (a task an agent lists through GET /api/specification-requests). */
  openRequest?: boolean;
  /** Requests only on a draft or paused campaign (the specify endpoint refuses a running one). */
  canRequest?: boolean;
}) {
  const router = useRouter();
  const [ask, setAsk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const byId = new Map(assets.map((a) => [a.id, a]));

  async function run(fn: () => Promise<{ ok: true } | { error: string }>, done: string) {
    setBusy(true);
    try {
      const r = await fn();
      setMsg("error" in r ? { ok: false, text: r.error } : { ok: true, text: done });
      if (!("error" in r)) router.refresh();
    } catch {
      setMsg({ ok: false, text: "Hálózati hiba, próbáld újra" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={s.panel} aria-label="Specifikáció AI-val">
      <div className={s.panelHead}>
        <h2 className={k.groupTitle}>Specifikáció AI-val</h2>
        {proposal?.proposed_by && <span className={k.muted}>javasolta: {proposal.proposed_by}{proposal.proposed_at ? `, ${proposal.proposed_at.slice(0, 10)}` : ""}</span>}
      </div>
      <p className={k.muted}>Egy ügynök az alábbi végponton javasolhat briefet, lépéseket és anyagokat. Minden anyag az Anyagok jóváhagyási sorába kerül; indítani nem tud.</p>
      {!proposal ? (
        <p className={k.muted}>Még nincs javaslat.</p>
      ) : (
        <>
          {proposal.brief && (
            <div>
              <div className={k.strong}>Brief javaslat</div>
              {Object.entries(proposal.brief).map(([key, v]) => (
                <div key={key} className={k.kv}><span>{BRIEF_LABEL[key] ?? key}</span><span>{typeof v === "string" ? v : JSON.stringify(v)}</span></div>
              ))}
            </div>
          )}
          {proposal.steps && proposal.steps.length > 0 && (
            <div>
              <div className={k.strong}>Lépések javaslat</div>
              <ol style={{ margin: "4px 0 0", paddingLeft: 20 }}>{proposal.steps.map((st, i) => <li key={i}>{stepLine(st)}</li>)}</ol>
            </div>
          )}
          {(proposal.assets ?? []).length > 0 && (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {(proposal.assets ?? []).map((a) => {
                const it = byId.get(a.item_id);
                return (
                  <li key={a.item_id} className={k.kv}>
                    <Link href={`/marketing/${a.item_id}`} className={k.link}>{it?.title ?? `Anyag #${a.item_id}`}{a.step_position ? `, ${a.step_position}. lépés` : ""}</Link>
                    <span className={s.state} data-s={it?.status}>Anyagok: {it ? assetStateLabel(it.status) : "nem található"}</span>
                  </li>
                );
              })}
            </ul>
          )}
          {proposal.note && <p className={k.muted}>{proposal.note}</p>}
          {editable && (
            <div className={k.actions}>
              {proposal.brief && <button type="button" className={k.btn} disabled={busy} onClick={() => run(() => updateCampaignAction(slug, { adopt_brief_proposal: true }), "A brief átvéve")}>Brief átvétele</button>}
              {canAdoptSteps && proposal.steps && proposal.steps.length > 0 && <button type="button" className={k.btn} disabled={busy} onClick={() => run(() => adoptProposedStepsAction(slug), "A lépések átvéve; a kampány piszkozat")}>Lépések átvétele</button>}
            </div>
          )}
        </>
      )}
      {canRequest && (
        <div>
          {openRequest && <p className={k.muted}>Nyitott kérés vár egy ügynökre (Feladatok). Az ügynök a válaszával lezárja.</p>}
          {ask == null ? (
            <button type="button" className={k.btn} disabled={busy} onClick={() => setAsk(missing.length ? `Hiányzik: ${missing.join(", ")}.` : "")}>
              {openRequest ? "Kérés frissítése" : "Ügynök kérése"}
            </button>
          ) : (
            <div className={s.field}>
              <label className={s.field}>
                <span>Mit kérsz az ügynöktől?</span>
                <textarea className={s.input} value={ask} maxLength={2000} disabled={busy} onChange={(e) => setAsk(e.target.value)} />
              </label>
              <div className={k.actions}>
                <button type="button" className={`${k.btn} ${k.btnPrimary}`} disabled={busy || !ask.trim()}
                  onClick={() => run(async () => { const r = await requestSpecificationAction(slug, ask); if ("ok" in r) setAsk(null); return r; }, "Kérés rögzítve: egy ügynök az API-n látja, és javaslattal válaszol")}>
                  Kérés küldése
                </button>
                <button type="button" className={k.btn} disabled={busy} onClick={() => setAsk(null)}>Mégse</button>
              </div>
            </div>
          )}
        </div>
      )}
      {msg && <p className={msg.ok ? s.ok : s.err} role="status">{msg.text}</p>}
      <p className={s.code}>Ügynöknek: GET /api/specification-requests, majd POST /api/campaigns/{slug}/specify (app kulcs, csak javaslat)</p>
    </section>
  );
}
