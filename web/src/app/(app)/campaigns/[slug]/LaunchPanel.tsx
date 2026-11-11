"use client";
// Indítás: audience with exclusions, steps with their approved asset versions, daily cap, dates,
// and the one approve-and-launch action, which only Áron's session can press (the service checks
// it again). Any later change of members, steps, cap or the outbound switch sends the campaign
// back to draft. Hungarian copy is PROPOSAL until Áron approves it.

import { useState } from "react";
import { useRouter } from "next/navigation";
import k from "@/components/astryx/page.module.css";
import { stepLine } from "@/lib/campaigns/labels";
import type { AssetState } from "@/lib/campaigns/hub";
import { approveCampaignAction, setCampaignStatusAction, updateCampaignAction } from "@/app/actions/campaign-hub";
import { assetStateLabel } from "@/lib/campaigns/labels";
import type { StepRow } from "./StepsSection";
import s from "../campaigns.module.css";

export interface LaunchData {
  slug: string; status: string; dailyCap: number; startsOn: string | null; endsOn: string | null;
  outboundAutomations: boolean; approvedAt: string | null; previewHash: string;
  steps: StepRow[]; assets: AssetState[]; members: Record<string, number>;
  /** Segment variants of the e-mail steps (lib/campaigns/preview campaignVariants). */
  variants?: { step: number; segment: string; itemId: number; status: string }[];
}

/** What still blocks a launch, in the service's order (approveCampaign is the final word). */
export function launchBlockers(d: Pick<LaunchData, "status" | "steps" | "assets" | "members" | "variants">): string[] {
  const out: string[] = [];
  if (d.status !== "draft" && d.status !== "paused") out.push(d.status === "running" ? "A kampány már fut" : "Lezárt kampány");
  if (d.steps.length === 0) out.push("Nincs lépés");
  const byId = new Map(d.assets.map((a) => [a.id, a]));
  for (const st of d.steps) {
    const a = st.contentItemId != null ? byId.get(st.contentItemId) : undefined;
    // Segment variants stand in for the step's own asset; every one must be live (service.approveCampaign).
    const vars = (d.variants ?? []).filter((v) => v.step === st.position);
    const open = vars.filter((v) => v.status !== "live");
    if (open.length) out.push(`${st.position}. lépés: ${open.length} szegmensváltozat még nincs jóváhagyva (${open.map((v) => v.segment).join(", ")})`);
    if (st.channel === "email" && !a && vars.length === 0) out.push(`${st.position}. lépés: nincs e-mail anyag`);
    else if (a && a.status !== "live") out.push(`${st.position}. lépés: az anyag még nincs jóváhagyva`);
  }
  if (!(d.members.queued > 0)) out.push("Nincs elérhető tag");
  return out;
}

const AUDIENCE: { key: string; label: string }[] = [
  { key: "queued", label: "elérhető" },
  { key: "needs_email", label: "e-mailre vár (nincs e-mail)" },
  { key: "needs_contact", label: "nincs elérhetőség" },
  { key: "promoted", label: "lead lett" },
  { key: "declined", label: "elutasította" },
  { key: "unreachable", label: "elérhetetlen" },
  { key: "excluded", label: "kizárva" },
];

export function LaunchPanel({ d, isAron }: { d: LaunchData; isAron: boolean }) {
  const router = useRouter();
  // The cap is typed as text and clamped on save, so clearing the field does not turn "20" into "120" (Vanda #190-1).
  const [capText, setCapText] = useState(String(d.dailyCap));
  const cap = Math.max(1, Math.min(200, Number(capText) || 1));
  const [from, setFrom] = useState(d.startsOn ?? "");
  const [to, setTo] = useState(d.endsOn ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const byId = new Map(d.assets.map((a) => [a.id, a]));
  const blockers = launchBlockers(d);
  const total = Object.values(d.members).reduce((a, b) => a + b, 0);
  const live = d.status === "running";

  async function run(fn: () => Promise<{ ok: true } | { error: string }>, done: string) {
    setBusy(true);
    setMsg(null);
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

  const settingsChanged = capText !== String(d.dailyCap) || from !== (d.startsOn ?? "") || to !== (d.endsOn ?? "");
  const assetsLine = d.steps.map((st) => {
    const a = st.contentItemId != null ? byId.get(st.contentItemId) : undefined;
    return a ? `${a.title}${a.version ? ` v${a.version}` : ""}` : null;
  }).filter(Boolean).join(", ");

  return (
    <div className={k.split}>
      <div>
        <section className={k.section} aria-label="Célközönség">
          <h2 className={k.groupTitle}>Célközönség</h2>
          <div className={s.counts}>
            {AUDIENCE.filter((a) => a.key === "queued" || (d.members[a.key] ?? 0) > 0).map((a) => (
              <div key={a.key} className={k.stat}><span className={k.statV}>{d.members[a.key] ?? 0}</span><span className={k.statK}>{a.label}</span></div>
            ))}
          </div>
          <p className={k.muted}>Kizárva betöltéskor: akinek nyitott leadje van, és a tiltólistás címek. Akinek közben lead lett, lekerül a napi listáról.</p>
        </section>
        <section className={k.section} aria-label="Lépések és anyagok">
          <h2 className={k.groupTitle}>Lépések</h2>
          <ol className={s.steps}>
            {d.steps.map((st) => {
              const a = st.contentItemId != null ? byId.get(st.contentItemId) : undefined;
              return (
                <li key={st.position} className={s.step}>
                  <span className={s.stepNo}>{st.position}</span>
                  <span>{stepLine(st)}</span>
                  <span className={s.state} data-s={a?.status}>{a ? `${a.title}${a.version ? ` v${a.version}` : ""}: ${assetStateLabel(a.status)}` : (d.variants ?? []).some((v) => v.step === st.position) ? `${(d.variants ?? []).filter((v) => v.step === st.position).length} szegmensváltozat` : "nincs anyag"}</span>
                </li>
              );
            })}
          </ol>
        </section>
      </div>
      <div>
        <section className={k.section} aria-label="Keret és időszak">
          <h2 className={k.groupTitle}>Napi keret és időszak</h2>
          <label className={s.field}><span>Napi keret (hívás)</span>
            <input className={s.input} type="number" min={1} max={200} value={capText} onChange={(e) => setCapText(e.target.value)} />
          </label>
          <div className={k.filters}>
            <label className={s.field}><span>Kezdés</span><input className={s.input} type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label className={s.field}><span>Vége</span><input className={s.input} type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          </div>
          <p className={k.muted}>A lista minden reggel számolódik, előre nem készül feladat; a kezdés előtt és a vége után üres. Kimenő automatizmusok (e-mail, webhook) a promóciónál: {d.outboundAutomations ? "bekapcsolva" : "kikapcsolva"}.</p>
          {settingsChanged && (
            <button type="button" className={k.btn} disabled={busy}
              onClick={() => run(() => updateCampaignAction(d.slug, { daily_cap: cap, starts_on: from || null, ends_on: to || null }), d.status !== "draft" && cap !== d.dailyCap ? "Mentve; a kampány visszaállt piszkozatra" : "Mentve")}>
              Keret és időszak mentése
            </button>
          )}
        </section>
        <section className={k.section} aria-label="Jóváhagyás">
          <p className={s.confirm}>
            Ezt hagyod jóvá: {total} cég ({d.members.queued ?? 0} elérhető), {d.steps.length} lépés, napi {d.dailyCap}{assetsLine ? `, ${assetsLine}` : ""}. Bármely módosítás után a kampány visszaáll piszkozatra.
          </p>
          {blockers.length > 0 && <ul className={`${k.muted} ${s.blockers}`}>{blockers.map((b) => <li key={b}>{b}</li>)}</ul>}
          {live ? (
            <div className={k.actions}>
              <button type="button" className={k.btn} disabled={busy} onClick={() => run(() => setCampaignStatusAction(d.slug, "paused"), "Szünetel")}>Szüneteltetés</button>
              <button type="button" className={k.btn} disabled={busy} onClick={() => run(() => setCampaignStatusAction(d.slug, "stopped"), "Leállítva")}>Leállítás</button>
            </div>
          ) : (
            <div className={k.actions}>
              {d.status === "paused" && <button type="button" className={k.btn} disabled={busy} onClick={() => run(() => setCampaignStatusAction(d.slug, "stopped"), "Leállítva")}>Leállítás</button>}
              <button type="button" className={`${k.btn} ${k.btnPrimary}`} disabled={busy || !isAron || blockers.length > 0 || settingsChanged}
                onClick={() => run(() => approveCampaignAction(d.slug, d.previewHash), "Elindítva")}>
                Jóváhagyás és indítás
              </button>
              {!isAron && <span className={k.muted}>csak Áron</span>}
            </div>
          )}
          {d.approvedAt && <p className={k.muted}>Utoljára jóváhagyva: {new Date(d.approvedAt).toLocaleString("hu-HU", { timeZone: "Europe/Budapest" })}</p>}
          {msg && <p className={msg.ok ? s.ok : s.err} role="status">{msg.text}</p>}
        </section>
      </div>
    </div>
  );
}
