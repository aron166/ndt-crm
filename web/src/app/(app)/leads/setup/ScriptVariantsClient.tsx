"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveScriptVariants } from "@/app/actions/leads";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
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
    <div className="panel" style={{ marginTop: 16 }}>
      <div className="panel-head"><div className="panel-title">Hívásszkript változatok (A/B)</div></div>
      <div className="panel-pad space-y-3">
        <p style={{ fontSize: 12, color: "var(--fg-mute)" }}>
          Egy blokk = egy szkript. A blokk első sora: azonosító|név — a többi sor a szkript
          szövege. A blokkokat egy önálló <code>---</code> sor választja el. Legfeljebb 5
          változat lehet.
        </p>
        <p style={{ fontSize: 12, color: "var(--coral)" }}>
          ⚠️ A gyári szkriptek helykitöltők, amíg Péter és Áron meg nem írja a valódi szöveget.
        </p>
        <Textarea rows={10} value={text} onChange={(e) => setText(e.target.value)} className="font-mono-ndt" />

        {error && <p style={{ fontSize: 12, color: "var(--coral)" }}>{error}</p>}
        <Button className="btn primary" size="sm" onClick={handleSave} disabled={isPending}>
          {isPending ? "Mentés…" : "Mentés"}
        </Button>

        <div style={{ marginTop: 8 }}>
          <div className="field-label" style={{ marginBottom: 6 }}>Elmúlt 90 nap eredményei</div>
          {!hasData ? (
            <p style={{ fontSize: 12, color: "var(--fg-mute)" }}>Még nincs adat</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12, minWidth: 480 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "4px 8px" }}>Szkript</th>
                    <th style={{ textAlign: "right", padding: "4px 8px" }}>Hívások</th>
                    {CALL_OUTCOMES.map((o) => (
                      <th key={o.key} style={{ textAlign: "right", padding: "4px 8px" }}>{o.label}</th>
                    ))}
                    <th style={{ textAlign: "right", padding: "4px 8px" }}>Demó arány</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map((row) => (
                    <tr key={row.key} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ padding: "4px 8px" }}>{row.label}</td>
                      <td style={{ textAlign: "right", padding: "4px 8px" }}>{row.calls}</td>
                      {CALL_OUTCOMES.map((o) => (
                        <td key={o.key} style={{ textAlign: "right", padding: "4px 8px" }}>
                          {row.byOutcome[o.key] ?? 0}
                        </td>
                      ))}
                      <td style={{ textAlign: "right", padding: "4px 8px" }}>
                        {(row.demoRate * 100).toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
