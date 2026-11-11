"use client";
// The campaign's steps with each step's asset state; editable by a person. Saving the steps of a
// running or paused campaign sends it back to draft (a new approval), and the page says so.
// Hungarian copy is PROPOSAL until Áron approves it.

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import k from "@/components/astryx/page.module.css";
import { assetStateLabel, stepLine, type StepDraft } from "@/lib/campaigns/labels";
import type { CampaignKind } from "@/lib/campaigns/rules";
import type { AssetState } from "@/lib/campaigns/hub";
import { saveStepsAction } from "@/app/actions/campaign-hub";
import { StepsEditor } from "../StepsEditor";
import s from "../campaigns.module.css";

export interface StepRow { position: number; channel: string; waitDays: number; audienceRule: string; contentItemId: number | null }

export function StepsSection({ slug, kind, status, steps, assets }: { slug: string; kind: CampaignKind; status: string; steps: StepRow[]; assets: AssetState[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<StepDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const byId = new Map(assets.map((a) => [a.id, a]));
  const closed = status === "stopped" || status === "done";

  function start() {
    setDraft(steps.map((st) => ({ channel: st.channel as StepDraft["channel"], wait_days: st.waitDays, audience_rule: st.audienceRule as StepDraft["audience_rule"], content_item_id: st.contentItemId })));
    setEditing(true);
  }
  async function save() {
    setBusy(true);
    setError(null);
    const r = await saveStepsAction(slug, draft);
    setBusy(false);
    if ("error" in r) return setError(r.error);
    setEditing(false);
    router.refresh();
  }

  return (
    <section className={k.section} aria-label="Lépések">
      <div className={s.panelHead}>
        <h2 className={k.groupTitle}>Lépések</h2>
        {!editing && !closed && <button type="button" className={k.btn} onClick={start}>Szerkesztés</button>}
      </div>
      {editing ? (
        <>
          <StepsEditor kind={kind} steps={draft} onChange={setDraft} assets={assets} />
          {status !== "draft" && <p className={k.muted}>Mentés után a kampány visszaáll piszkozatra; Áronnak újra jóvá kell hagynia.</p>}
          {error && <p className={s.err} role="alert">{error}</p>}
          <div className={k.actions}>
            <button type="button" className={`${k.btn} ${k.btnPrimary}`} disabled={busy} onClick={save}>Lépések mentése</button>
            <button type="button" className={k.btn} disabled={busy} onClick={() => setEditing(false)}>Mégse</button>
          </div>
        </>
      ) : steps.length === 0 ? (
        <p className={k.muted}>Nincs lépés.</p>
      ) : (
        <ol className={s.steps}>
          {steps.map((st) => {
            const a = st.contentItemId != null ? byId.get(st.contentItemId) : undefined;
            return (
              <li key={st.position} className={s.step}>
                <span className={s.stepNo}>{st.position}</span>
                <span>{stepLine(st)}</span>
                {a ? (
                  <Link href={`/marketing/${a.id}`} className={s.state} data-s={a.status}>{a.title}{a.version ? ` v${a.version}` : ""}: {assetStateLabel(a.status)}</Link>
                ) : (
                  <span className={s.state}>nincs anyag</span>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
