"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, AlertTriangle } from "lucide-react";
import { upsertCostRate, type CostRateEntry } from "@/app/actions/cost-rates";
import k from "@/components/astryx/page.module.css";
import q from "../quotes/quotes.module.css";
import { costCodeLabel, costCodeUnitHint } from "@/lib/tasks/costing";

export function RateCardClient({ initialRates }: { initialRates: CostRateEntry[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(
    initialRates.map((r) => ({
      code: r.code,
      unit: r.unit ?? "",
      unitRate: r.unitRate != null ? String(r.unitRate) : "",
    })),
  );
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function set(code: string, key: "unit" | "unitRate", value: string) {
    setRows((rs) => rs.map((r) => (r.code === code ? { ...r, [key]: value } : r)));
  }

  function handleSave() {
    setMsg(null);
    // Validate every row up front so all bad rates surface at once, not one-by-one.
    const invalid = rows.filter((r) => {
      const t = r.unitRate.trim();
      if (!t) return false;
      const n = Number(t.replace(",", "."));
      return !Number.isFinite(n) || n < 0;
    });
    if (invalid.length) {
      setMsg({ ok: false, text: `Érvénytelen egységár: ${invalid.map((r) => costCodeLabel(r.code)).join(", ")}` });
      return;
    }
    startTransition(async () => {
      for (const r of rows) {
        const res = await upsertCostRate(r.code, r.unit, r.unitRate);
        if (res?.error) { setMsg({ ok: false, text: `${costCodeLabel(r.code)}: ${res.error}` }); return; }
      }
      router.refresh();
      setMsg({ ok: true, text: "Díjszabás mentve." });
    });
  }

  return (
    <div className={q.box}>
      <div className={k.tableWrap}>
        <table className={k.table} style={{ minWidth: 0 }}>
          <thead>
            <tr>
              {["Költségkód", "Egység", "Egységár (Ft)"].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.code}>
                <td>{costCodeLabel(r.code)}</td>
                <td style={{ width: 140 }}>
                  <input className={q.input} value={r.unit} onChange={(e) => set(r.code, "unit", e.target.value)} placeholder={costCodeUnitHint(r.code)} />
                </td>
                <td style={{ width: 160 }}>
                  <input className={`${q.input} ${q.numCell}`} type="number" inputMode="decimal" step="any" min={0} value={r.unitRate} onChange={(e) => set(r.code, "unitRate", e.target.value)} placeholder="-" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3 mt-4">
        <button className={`${k.btn} ${k.btnPrimary}`} disabled={pending} onClick={handleSave}>
          {pending ? "Mentés…" : "Mentés"}
        </button>
        {msg && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 14, color: msg.ok ? "var(--color-text-success)" : "var(--color-text-error)" }}>
            {msg.ok ? <Check size={14} aria-hidden="true" /> : <AlertTriangle size={14} aria-hidden="true" />} {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}
