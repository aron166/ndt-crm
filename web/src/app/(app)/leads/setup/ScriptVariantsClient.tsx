"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { saveScriptVariants } from "@/app/actions/leads";
import k from "@/components/astryx/page.module.css";
import m from "./setup.module.css";
import { formatScriptBlocks, type ScriptVariant } from "@/lib/leads/scripts";
import { CALL_OUTCOMES } from "@/lib/leads/outcomes";
import type { ScriptStatRow } from "@/lib/leads/script-stats";

export function ScriptVariantsClient({
  variants,
  stats,
}: {
  variants: ScriptVariant[];
  stats: ScriptStatRow[];
}) {
  const router = useRouter();
  const [text, setText] = useState(formatScriptBlocks(variants));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const res = await saveScriptVariants(text);
      if ("error" in res) { setError(res.error); return; }
      router.refresh();
    });
  }

  const hasData = stats.some((s) => s.calls > 0);

  return (
    <section className={k.section}>
      <h2 className={k.h2}>Hívásszkript változatok (A/B)</h2>
      <p className={k.muted}>
        Egy blokk = egy szkript. A blokk első sora: azonosító|név: a többi sor a szkript
        szövege. A blokkokat egy önálló <code>---</code> sor választja el. Legfeljebb 5
        változat lehet.
      </p>
      <p className={m.errorLine}>
        <AlertTriangle size={13} aria-hidden="true" /> A gyári szkriptek helykitöltők, amíg Péter és Áron meg nem írja a valódi szöveget.
      </p>
      <textarea rows={10} value={text} onChange={(e) => setText(e.target.value)} className={`${m.field} ${m.textarea} ${m.scriptArea} font-mono-ndt`} />

      {error && <p className={m.error}>{error}</p>}
      <div>
        <button type="button" className={`${k.btn} ${k.btnPrimary}`} onClick={handleSave} disabled={isPending}>
          {isPending ? "Mentés…" : "Mentés"}
        </button>
      </div>

      <div>
        <div className={m.subtitle}>Elmúlt 90 nap eredményei</div>
        {!hasData ? (
          <p className={k.muted}>Még nincs adat</p>
        ) : (
          <>
            <div className={k.tableWrap}>
              <table className={`${k.table} ${m.numTable}`}>
                <thead>
                  <tr>
                    <th>Szkript</th>
                    <th>Hívások</th>
                    {CALL_OUTCOMES.map((o) => (
                      <th key={o.key}>{o.label}</th>
                    ))}
                    <th>Demó arány</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map((row) => (
                    <tr key={row.key}>
                      <td>{row.label}</td>
                      <td>{row.calls}</td>
                      {CALL_OUTCOMES.map((o) => (
                        <td key={o.key}>
                          {row.byOutcome[o.key] ?? 0}
                        </td>
                      ))}
                      <td>
                        {row.reached < 10 ? "-" : `${(row.demoRate * 100).toFixed(1)}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={`${k.muted} ${m.hint}`}>
              A demó arány csak legalább 10 elért hívás után jelenik meg: kevesebb adatnál a szám nem mond semmit.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
