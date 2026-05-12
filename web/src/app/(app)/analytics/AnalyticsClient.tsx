"use client";

import { useState } from "react";
import { AreaChart } from "@/components/viz/AreaChart";

interface RevenueMonth {
  month: string;
  total: number;
}

interface AnalyticsClientProps {
  revenueByMonth: RevenueMonth[];
}

const ENTITY_LINKS = [
  { label: "Összes cég",                href: "/companies",                       count: "1 696" },
  { label: "Soha nem kontaktált cégek", href: "/companies",                       count: "→" },
  { label: "Összes személy",            href: "/persons",                         count: "1 632" },
  { label: "Feladatok",                 href: "/tasks",                           count: "→" },
  { label: "Pipeline deals",           href: "/deals",                           count: "→" },
  { label: "Pipeline beállítás",        href: "/deals/setup",                     count: "→" },
];

export function AnalyticsClient({ revenueByMonth }: AnalyticsClientProps) {
  const [activeSection, setActiveSection] = useState<"revenue" | "explorer">("revenue");

  const monthSeries = revenueByMonth.map((r) => r.total / 1_000_000);
  const monthLabels = revenueByMonth.map((r) => r.month.slice(2)); // "YY-MM"

  return (
    <div className="space-y-6">
      {/* Section tabs */}
      <div className="tabs-ds">
        <button className={`tab-ds ${activeSection === "revenue" ? "active" : ""}`} onClick={() => setActiveSection("revenue")}>
          Bevétel · 24 hónap
        </button>
        <button className={`tab-ds ${activeSection === "explorer" ? "active" : ""}`} onClick={() => setActiveSection("explorer")}>
          Adatok böngészése
        </button>
      </div>

      {/* Revenue 24 months */}
      {activeSection === "revenue" && (
        <div className="panel mount">
          <div className="panel-head">
            <div className="panel-title">Havi forgalom · elmúlt 24 hónap (M HUF)</div>
            {monthSeries.length > 0 && (
              <span className="font-mono-ndt" style={{ fontSize: 11, color: "var(--mint)" }}>
                {monthSeries.reduce((s, v) => s + v, 0).toFixed(1)}M összesen
              </span>
            )}
          </div>
          <div style={{ padding: 20 }}>
            {monthSeries.length >= 2 ? (
              <>
                <AreaChart data={monthSeries} height={180} color="var(--mint)" />
                <div style={{ display: "flex", gap: 4, marginTop: 10, overflowX: "auto", paddingBottom: 4 }}>
                  {revenueByMonth.map((r, i) => (
                    <div key={i} style={{ textAlign: "center", flexShrink: 0, minWidth: 36 }}>
                      <div className="font-mono-ndt" style={{ fontSize: 9, color: r.total > 0 ? "var(--mint)" : "var(--fg-faint)" }}>
                        {r.total > 0 ? (r.total / 1_000_000).toFixed(0) : "—"}
                      </div>
                      <div style={{ fontSize: 8, color: "var(--fg-faint)" }}>{monthLabels[i]}</div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p style={{ fontSize: 13, color: "var(--fg-faint)", textAlign: "center", padding: "32px 0" }}>
                Nincs adat az elmúlt 24 hónapra.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Data explorer */}
      {activeSection === "explorer" && (
        <div className="panel mount">
          <div className="panel-head">
            <div className="panel-title">Adatok böngészése</div>
            <p style={{ fontSize: 12, color: "var(--fg-mute)" }}>Kattints bármelyik entitásra a szűrt nézethez</p>
          </div>
          <div style={{ padding: 20 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
              {ENTITY_LINKS.map(({ label, href, count }) => (
                <a
                  key={label}
                  href={href}
                  className="flex items-center justify-between rounded-lg"
                  style={{
                    padding: "12px 14px",
                    background: "var(--bg-0)",
                    border: "1px solid var(--line-soft)",
                    fontSize: 13, color: "var(--fg-soft)",
                    transition: "border-color .15s, background .15s",
                  }}
                  onMouseOver={(e) => { e.currentTarget.style.borderColor = "var(--indigo-line)"; e.currentTarget.style.background = "var(--indigo-soft)"; }}
                  onMouseOut={(e) => { e.currentTarget.style.borderColor = "var(--line-soft)"; e.currentTarget.style.background = "var(--bg-0)"; }}
                >
                  <span>{label}</span>
                  <span className="font-mono-ndt" style={{ fontSize: 11, color: "var(--indigo)" }}>{count}</span>
                </a>
              ))}
            </div>

            {/* Future: custom query builder */}
            <div style={{ marginTop: 20, padding: 16, border: "1px dashed var(--line-soft)", borderRadius: 8, fontSize: 12, color: "var(--fg-faint)", textAlign: "center" }}>
              Hamarosan: egyéni lekérdezés-készítő, exportálás CSV-be, mentett nézetek
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
