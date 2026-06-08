"use client";

import { useMemo, useState } from "react";
import {
  EQUALIZER_STREAMS, totalRevenue, gapToTarget, quantityToHitTarget, revenueShares,
  type RevenueStream,
} from "@/lib/equalizer/calc";

const HUF = new Intl.NumberFormat("hu-HU", { style: "currency", currency: "HUF", maximumFractionDigits: 0 });
const SLIDER_MAX = 50;

const STREAM_COLOR: Record<string, string> = {
  demo: "#6366f1", standard: "#06b6d4", unlimited: "#22c55e", machine_sale: "#f59e0b",
};

export function EqualizerClient() {
  const [streams, setStreams] = useState<RevenueStream[]>(
    EQUALIZER_STREAMS.map((s) => ({ ...s, unitValue: 0, quantity: 0 })),
  );
  const [target, setTarget] = useState(0);

  const total = useMemo(() => totalRevenue(streams), [streams]);
  const gap = useMemo(() => gapToTarget(streams, target), [streams, target]);
  const shares = useMemo(() => revenueShares(streams), [streams]);

  function patch(key: string, field: "unitValue" | "quantity", value: number) {
    setStreams((prev) => prev.map((s) => (s.key === key ? { ...s, [field]: Math.max(0, value) } : s)));
  }

  const onTarget = gap === 0 && target > 0;
  const over = gap < 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 920 }}>
      {/* Target + total summary */}
      <div className="panel mount" style={{ padding: "18px 22px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 18 }}>
        <div>
          <div className="field-label">Bevételi cél (HUF)</div>
          <input
            type="number" min={0} value={target || ""}
            onChange={(e) => setTarget(Math.max(0, Number(e.target.value)))}
            placeholder="pl. 5 000 000"
            className="input-ds" style={{ fontFamily: "var(--font-mono)" }}
          />
        </div>
        <div>
          <div className="field-label">Tervezett bevétel</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 500, color: "var(--fg)", marginTop: 2 }}>
            {HUF.format(total)}
          </div>
        </div>
        <div>
          <div className="field-label">Eltérés a céltól</div>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 500, marginTop: 2,
            color: onTarget ? "var(--mint)" : over ? "var(--amber)" : "var(--fg-soft)",
          }}>
            {onTarget ? "✓ Cél elérve" : `${over ? "+" : ""}${HUF.format(-gap)}`}
          </div>
        </div>
      </div>

      {/* Mix bar */}
      {total > 0 && (
        <div style={{ display: "flex", height: 10, borderRadius: 6, overflow: "hidden", border: "1px solid var(--line-soft)" }}>
          {shares.map((s) => (
            s.share > 0 ? (
              <div key={s.key} title={`${Math.round(s.share * 100)}%`}
                style={{ width: `${s.share * 100}%`, background: STREAM_COLOR[s.key] ?? "var(--indigo)" }} />
            ) : null
          ))}
        </div>
      )}

      {/* Stream sliders */}
      <div className="panel mount" style={{ padding: "8px 22px 18px" }}>
        {streams.map((s) => {
          const revenue = s.unitValue * s.quantity;
          const needed = quantityToHitTarget(streams, s.key, target);
          const share = shares.find((x) => x.key === s.key)?.share ?? 0;
          return (
            <div key={s.key} style={{ padding: "16px 0", borderBottom: "1px solid var(--line-soft)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: STREAM_COLOR[s.key], flexShrink: 0 }} />
                <span style={{ fontWeight: 600, color: "var(--fg)" }}>{s.label}</span>
                <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--fg-soft)" }}>
                  {HUF.format(revenue)}
                  <span style={{ color: "var(--fg-faint)", marginLeft: 8 }}>{Math.round(share * 100)}%</span>
                </span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "160px 1fr 90px", gap: 14, alignItems: "center" }}>
                {/* Unit value */}
                <div>
                  <div className="field-label">Egységár (HUF)</div>
                  <input
                    type="number" min={0} value={s.unitValue || ""}
                    onChange={(e) => patch(s.key, "unitValue", Number(e.target.value))}
                    placeholder="0"
                    className="input-ds" style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}
                  />
                </div>
                {/* Quantity slider */}
                <div>
                  <div className="field-label">Darabszám: {s.quantity}</div>
                  <input
                    type="range" min={0} max={SLIDER_MAX} step={1} value={Math.min(s.quantity, SLIDER_MAX)}
                    onChange={(e) => patch(s.key, "quantity", Number(e.target.value))}
                    style={{ width: "100%", accentColor: STREAM_COLOR[s.key] }}
                  />
                </div>
                {/* Quantity exact */}
                <div>
                  <div className="field-label">db</div>
                  <input
                    type="number" min={0} value={s.quantity || ""}
                    onChange={(e) => patch(s.key, "quantity", Number(e.target.value))}
                    placeholder="0"
                    className="input-ds" style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}
                  />
                </div>
              </div>

              {/* "to hit target" helper */}
              {target > 0 && (
                <div style={{ fontSize: 11, color: "var(--fg-mute)", marginTop: 8 }}>
                  {needed === null
                    ? "Add meg az egységárat, hogy kiszámoljuk a célhoz szükséges darabszámot."
                    : needed === 0
                      ? "A többi stream már fedezi a célt — ebből nem kell több."
                      : <>A cél eléréséhez {needed === s.quantity ? "épp ennyi" : <strong style={{ color: "var(--fg-soft)" }}>{needed} db</strong>} kell ebből (a többit fixen tartva).</>}
                </div>
              )}
            </div>
          );
        })}
        <div style={{ marginTop: 14, fontSize: 11, color: "var(--fg-faint)", lineHeight: 1.5 }}>
          Belső tervezőeszköz — az adatok nem mentődnek. Az egységárakat te állítod
          be; a számológép nem tölt be valós árakat.
        </div>
      </div>
    </div>
  );
}
