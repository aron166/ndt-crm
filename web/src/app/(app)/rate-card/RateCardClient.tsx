"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { upsertCostRate, type CostRateEntry } from "@/app/actions/cost-rates";
import { costCodeLabel, costCodeUnitHint } from "@/lib/tasks/costing";

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "6px 10px", fontSize: 13,
  background: "var(--bg-0)", border: "1px solid var(--line-soft)",
  borderRadius: 6, color: "var(--fg)", outline: "none",
};

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
    <div style={{ background: "var(--bg-panel)", border: "1px solid var(--line-soft)", borderRadius: 12 }} className="p-5">
      <table className="w-full text-sm">
        <thead>
          <tr>
            {["Költségkód", "Egység", "Egységár (Ft)"].map((h) => (
              <th key={h} style={{ textAlign: "left", padding: "6px 10px", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--fg-faint)" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.code} style={{ borderTop: "1px solid var(--line-soft)" }}>
              <td style={{ padding: "8px 10px", color: "var(--fg-soft)" }}>{costCodeLabel(r.code)}</td>
              <td style={{ padding: "8px 10px", width: 140 }}>
                <input style={inputStyle} value={r.unit} onChange={(e) => set(r.code, "unit", e.target.value)} placeholder={costCodeUnitHint(r.code)} />
              </td>
              <td style={{ padding: "8px 10px", width: 160 }}>
                <input type="number" inputMode="decimal" step="any" min={0} style={inputStyle} value={r.unitRate} onChange={(e) => set(r.code, "unitRate", e.target.value)} placeholder="—" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex items-center gap-3 mt-4">
        <button className="btn primary" disabled={pending} onClick={handleSave}>
          {pending ? "Mentés…" : "Mentés"}
        </button>
        {msg && (
          <span style={{ fontSize: 12, color: msg.ok ? "var(--mint)" : "var(--coral)" }}>
            {msg.ok ? "✓ " : "⚠ "}{msg.text}
          </span>
        )}
      </div>
    </div>
  );
}
