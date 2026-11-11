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
import { adoptProposedStepsAction, updateCampaignAction } from "@/app/actions/campaign-hub";
import type { AssetState } from "@/lib/campaigns/hub";
import s from "../campaigns.module.css";


export interface Proposal {
  brief?: Record<string, unknown> | null;
  steps?: { channel: string; wait_days?: number; audience_rule?: string }[] | null;
  assets?: { item_id: number; step_position: number | null }[];
  note?: string | null;
  proposed_by?: string;
  proposed_at?: string;
}

export function SpecifyPanel({ slug, proposal, assets, editable }: { slug: string; proposal: Proposal | null; assets: AssetState[]; editable: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const byId = new Map(assets.map((a) => [a.id, a]));

  async function run(fn: () => Promise<{ ok: true } | { error: string }>, done: string) {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    setMsg("error" in r ? { ok: false, text: r.error } : { ok: true, text: done });
    if (!("error" in r)) router.refresh();
  }

  return (
    <section className={s.panel} aria-label="Specifikáció AI-val">
      <div className={s.panelHead}>
        <h2 className={k.groupTitle}>Specifikáció AI-val</h2>
        {proposal?.proposed_by && <span className={k.muted}>javasolta: {proposal.proposed_by}{proposal.proposed_at ? `, ${proposal.proposed_at.slice(0, 10)}` : ""}</span>}
      </div>
      <p className={k.muted}>Egy ügynök kitölti a briefet és megírja az anyagokat. Minden anyag az Anyagok jóváhagyási sorába kerül; indítani nem tud.</p>
      {!proposal ? (
        <p className={k.muted}>Még nincs javaslat.</p>
      ) : (
        <>
          {proposal.brief && (
            <div>
              <div className={k.strong}>Brief javaslat</div>
              {Object.entries(proposal.brief).map(([key, v]) => (
                <div key={key} className={k.kv}><span>{key}</span><span>{typeof v === "string" ? v : JSON.stringify(v)}</span></div>
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
              {proposal.steps && proposal.steps.length > 0 && <button type="button" className={k.btn} disabled={busy} onClick={() => run(() => adoptProposedStepsAction(slug), "A lépések átvéve; a kampány piszkozat")}>Lépések átvétele</button>}
            </div>
          )}
        </>
      )}
      {msg && <p className={msg.ok ? s.ok : s.err} role="status">{msg.text}</p>}
      <p className={s.code}>Ügynöknek: POST /api/campaigns/{slug}/specify (app kulcs, csak javaslat)</p>
    </section>
  );
}
