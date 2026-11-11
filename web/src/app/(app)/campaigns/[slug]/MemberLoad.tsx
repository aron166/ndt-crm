"use client";
// Tagok betöltése: pick a prepared file (members wire rows or the launch-list builder's rows),
// dry run with counts, then apply by a logged-in admin or manager (service-enforced; an app key
// can only dry-run). A batch nobody has touched can be undone, after its own dry run.
// Hungarian copy is PROPOSAL until Áron approves it.

import { useState } from "react";
import { useRouter } from "next/navigation";
import k from "@/components/astryx/page.module.css";
import { uiBatchId } from "@/lib/campaigns/labels";
import { loadMembersAction, undoBatchAction } from "@/app/actions/campaign-hub";
import s from "../campaigns.module.css";

type Summary = {
  total: number; add: number; refresh: number; skip: number; newCompanies: number; newPersons: number;
  needsContact: number; needsEmail: number; skipped: Record<string, number>;
};

/** The five counts Áron asked for, from a dry-run summary. */
export function loadCounts(sm: Summary) {
  return [
    { k: "Új tag", v: sm.add + sm.refresh },
    { k: "Már lead (kihagyva)", v: sm.skipped.open_lead ?? 0 },
    { k: "Tiltólistás (kihagyva)", v: sm.skipped.suppressed ?? 0 },
    { k: "Duplikátum (kihagyva)", v: (sm.skipped.duplicate_in_payload ?? 0) + (sm.skipped.already_member ?? 0) },
    { k: "Nincs e-mail (e-mailre vár)", v: sm.needsEmail },
  ];
}

export interface BatchRow { batch: string; members: number; touched: number; createdAt: string | Date | null }

export function MemberLoad({ slug, canOperate, closed, batches }: { slug: string; canOperate: boolean; closed: boolean; batches: BatchRow[] }) {
  const router = useRouter();
  const [fileText, setFileText] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [batch, setBatch] = useState(() => uiBatchId(new Date()));
  const [dry, setDry] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [undo, setUndo] = useState<{ batch: string; summary: { members: number; remove: number; keptTouched: number; softDeleteCompanies: number; softDeletePersons: number } } | null>(null);

  async function onFile(f: File | undefined) {
    setDry(null);
    setMsg(null);
    if (!f) return setFileText(null);
    setFileName(f.name);
    setFileText(await f.text());
  }

  async function run(dryRun: boolean) {
    if (!fileText) return;
    setBusy(true);
    setMsg(null);
    const r = await loadMembersAction(slug, { fileText, batch, dryRun });
    setBusy(false);
    if ("error" in r) return setMsg({ ok: false, text: r.error });
    if (dryRun) return setDry(r.summary as Summary);
    setMsg({ ok: true, text: `Betöltve: ${r.added} új tag (${batch}).` });
    setDry(null);
    setFileText(null);
    setFileName("");
    setBatch(uiBatchId(new Date()));
    router.refresh();
  }

  async function startUndo(b: string, dryRun: boolean) {
    setBusy(true);
    setMsg(null);
    const r = await undoBatchAction(slug, b, dryRun);
    setBusy(false);
    if ("error" in r) return setMsg({ ok: false, text: r.error ?? "Hiba" });
    if (dryRun) return setUndo({ batch: b, summary: r.summary });
    setUndo(null);
    setMsg({ ok: true, text: `Visszavonva: ${r.summary.remove} tag (${b}).` });
    router.refresh();
  }

  return (
    <section className={k.section} aria-label="Tagok betöltése">
      <h2 className={k.groupTitle}>Tagok betöltése</h2>
      {closed ? <p className={k.muted}>Lezárt kampányhoz nem adható tag.</p> : (
        <>
          <p className={k.muted}>Előkészített fájl (JSON: a listaépítő sorai vagy tag sorok). Előbb próba: semmi nem íródik. Betölteni admin vagy manager tud.</p>
          <div className={k.filters}>
            <label className={s.field}>
              <span>Fájl</span>
              <input type="file" accept=".json,application/json" onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
            <label className={s.field}>
              <span>Betöltés azonosító</span>
              <input className={s.input} value={batch} onChange={(e) => { setBatch(e.target.value); setDry(null); }} pattern="[A-Za-z0-9_-]{1,64}" maxLength={64} />
            </label>
          </div>
          {fileName && <p className={k.muted}>{fileName}</p>}
          <div className={k.actions}>
            <button type="button" className={`${k.btn} ${dry ? "" : k.btnPrimary}`} disabled={!fileText || busy} onClick={() => run(true)}>Próba</button>
            {dry && (
              <button type="button" className={`${k.btn} ${k.btnPrimary}`} disabled={busy || !canOperate || dry.add + dry.refresh === 0} onClick={() => run(false)}>
                Betöltés ({dry.add + dry.refresh})
              </button>
            )}
          </div>
          {dry && !canOperate && <p className={k.muted}>Betölteni admin vagy manager szereppel lehet.</p>}
          {dry && (
            <div className={s.counts} aria-label="Próba eredménye">
              {loadCounts(dry).map((c) => (
                <div key={c.k} className={k.stat}><span className={k.statK}>{c.k}</span><span className={k.statV}>{c.v}</span></div>
              ))}
            </div>
          )}
        </>
      )}
      {msg && <p className={msg.ok ? s.ok : s.err} role="status">{msg.text}</p>}

      {batches.length > 0 && (
        <div className={k.tableWrap}>
          <table className={k.table}>
            <thead><tr><th>Betöltés</th><th>Tag</th><th>Érintve</th><th /></tr></thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.batch}>
                  <td className={s.code}>{b.batch}</td>
                  <td className={k.num}>{b.members}</td>
                  <td className={k.num}>{b.touched}</td>
                  <td>
                    {b.touched === 0 && canOperate
                      ? <button type="button" className={k.btn} disabled={busy} onClick={() => startUndo(b.batch, true)}>Visszavonás</button>
                      : <span className={k.muted}>{b.touched > 0 ? "már érintve" : ""}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {undo && (
        <div className={s.confirm} role="group" aria-label="Visszavonás megerősítése">
          <p>{undo.batch}: {undo.summary.remove} tag törlődik, {undo.summary.softDeleteCompanies} cég és {undo.summary.softDeletePersons} személy archiválódik, amit ez a betöltés hozott létre. {undo.summary.keptTouched} érintett tag marad.</p>
          <div className={k.actions}>
            <button type="button" className={k.btn} disabled={busy} onClick={() => startUndo(undo.batch, false)}>Visszavonás megerősítése</button>
            <button type="button" className={k.btn} disabled={busy} onClick={() => setUndo(null)}>Mégse</button>
          </div>
        </div>
      )}
    </section>
  );
}
