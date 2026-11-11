"use client";
// Hand-entered numbers for one published asset of an ad or organic campaign (item 6), until a
// connector exists. Same action as the Anyagok page (saveContentMetrics validates on the server).
// Hungarian copy is PROPOSAL until Áron approves it.

import { useState } from "react";
import { useRouter } from "next/navigation";
import k from "@/components/astryx/page.module.css";
import { saveContentMetrics } from "@/app/actions/marketing";
import { METRIC_KEYS, METRIC_LABEL } from "@/lib/content/metrics";
import s from "../campaigns.module.css";

export function MetricsCells({ id, published, metrics }: { id: number; published: boolean; metrics: Record<string, number> | null }) {
  const router = useRouter();
  const [vals, setVals] = useState<Record<string, string>>(() =>
    Object.fromEntries(METRIC_KEYS.map((key) => [key, typeof metrics?.[key] === "number" ? String(metrics[key]) : ""])));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (!published) {
    return (
      <>
        {METRIC_KEYS.map((key) => <td key={key} className={k.num}>-</td>)}
        <td className={k.muted}>Előbb jelenjen meg</td>
      </>
    );
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await saveContentMetrics(id, vals);
      if ("error" in r && r.error) setMsg(r.error);
      else { setMsg("Mentve"); router.refresh(); }
    } catch {
      setMsg("Hálózati hiba, próbáld újra");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {METRIC_KEYS.map((key) => (
        <td key={key} className={k.num}>
          <input
            aria-label={METRIC_LABEL[key]} inputMode="numeric" className={`${s.input} ${s.metric}`} value={vals[key]} disabled={busy}
            onChange={(e) => setVals((v) => ({ ...v, [key]: e.target.value }))}
          />
        </td>
      ))}
      <td>
        <button type="button" className={k.btn} disabled={busy} onClick={save}>Mentés</button>
        {msg && <span className={k.muted} role="status"> {msg}</span>}
      </td>
    </>
  );
}
