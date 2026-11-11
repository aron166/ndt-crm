"use client";
// Létrehozás és specifikáció: the type is chosen at creation and fixes the step shape
// (lib/campaigns/rules stepsFitKind). Hungarian copy is PROPOSAL until Áron approves it.

import { useState } from "react";
import { useRouter } from "next/navigation";
import k from "@/components/astryx/page.module.css";
import { CREATE_KINDS, defaultSteps, isContentOnly } from "@/lib/campaigns/labels";
import type { CampaignKind } from "@/lib/campaigns/rules";
import { createCampaignAction } from "@/app/actions/campaign-hub";
import { StepsEditor } from "../StepsEditor";
import s from "../campaigns.module.css";

export function CreateCampaignForm({ users }: { users: { id: number; name: string }[] }) {
  const router = useRouter();
  // The launch list default is the sequence (Áron 2026-11-11, e-mail first for everyone).
  const [kind, setKind] = useState<CampaignKind>("sequence");
  const [name, setName] = useState("");
  const [offer, setOffer] = useState("");
  const [audience, setAudience] = useState("");
  const [owner, setOwner] = useState<number | "">("");
  const [steps, setSteps] = useState(defaultSteps("sequence"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pick(next: CampaignKind) {
    setKind(next);
    setSteps(defaultSteps(next));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await createCampaignAction({
      name, kind,
      ...(owner !== "" ? { owner_user_id: owner } : {}),
      brief: { ...(offer.trim() ? { offer: offer.trim() } : {}), ...(audience.trim() ? { audience: audience.trim() } : {}) },
      steps,
    });
    setBusy(false);
    if ("error" in r) return setError(r.error);
    router.push(`/campaigns/${r.slug}`);
  }

  return (
    <form className={s.form} onSubmit={submit}>
      <fieldset className={s.kinds}>
        <legend className={k.strong} style={{ marginBottom: 8 }}>Típus</legend>
        {CREATE_KINDS.map((o) => (
          <label key={o.kind} className={s.kind} data-on={kind === o.kind}>
            <input type="radio" name="kind" value={o.kind} checked={kind === o.kind} onChange={() => pick(o.kind)} />
            <b>{o.label}</b>
            <small>{o.hint}</small>
          </label>
        ))}
      </fieldset>
      <label className={s.field}>
        <span>Név</span>
        <input className={s.input} value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
      </label>
      <label className={s.field}>
        <span>Cél, ajánlat</span>
        <textarea className={s.input} value={offer} onChange={(e) => setOffer(e.target.value)} maxLength={2000} />
      </label>
      <label className={s.field}>
        <span>Célközönség</span>
        <textarea className={s.input} value={audience} onChange={(e) => setAudience(e.target.value)} maxLength={2000} />
      </label>
      <label className={s.field}>
        <span>Felelős</span>
        <select className={s.input} value={owner} onChange={(e) => setOwner(e.target.value ? Number(e.target.value) : "")}>
          <option value="">Nincs megadva (Péter hív)</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </label>
      <div className={s.field}>
        <span>Lépések</span>
        {isContentOnly(kind) ? (
          <p className={k.muted}>Ez a típus egyelőre csak tartalom: anyagok a Marketing oldalon és kézzel rögzített számok. Nincs tag, nincs indítás.</p>
        ) : (
          <StepsEditor kind={kind} steps={steps} onChange={setSteps} />
        )}
      </div>
      {error && <p className={s.err} role="alert">{error}</p>}
      <div>
        <button type="submit" className={`${k.btn} ${k.btnPrimary}`} disabled={busy || !name.trim()}>Piszkozat mentése</button>
      </div>
      <p className={k.muted}>Piszkozat. Semmi nem megy ki, amíg Áron el nem indítja.</p>
    </form>
  );
}
