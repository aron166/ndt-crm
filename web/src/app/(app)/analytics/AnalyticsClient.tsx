"use client";

import { useState } from "react";
import { AreaChart } from "@/components/viz/AreaChart";

interface RevenueMonth {
  month: string;
  total: number;
}

interface AnalyticsClientProps {
  revenueByMonth: RevenueMonth[];
  totalCompanies: number;
  totalPersons: number;
  neverContacted: number;
  openTasks: number;
  openDeals: number;
}

export function AnalyticsClient({
  revenueByMonth,
  totalCompanies,
  totalPersons,
  neverContacted,
  openTasks,
  openDeals,
}: AnalyticsClientProps) {
  const [activeSection, setActiveSection] = useState<"revenue" | "explorer">("revenue");

  const monthSeries = revenueByMonth.map((r) => r.total / 1_000_000);
  const monthLabels = revenueByMonth.map((r) => r.month.slice(2));

  const entityLinks: { label: string; href: string; count: string; accent?: string }[] = [
    { label: "Összes cég",                href: "/companies",                   count: totalCompanies.toLocaleString("hu-HU") },
    { label: "Soha nem kontaktált",       href: "/companies?never_contacted=1", count: neverContacted.toLocaleString("hu-HU"), accent: "var(--amber)" },
    { label: "Összes személy",            href: "/persons",                     count: totalPersons.toLocaleString("hu-HU") },
    { label: "Nyitott feladatok",         href: "/tasks?status=open",           count: openTasks > 0 ? openTasks.toLocaleString("hu-HU") : "—" },
    { label: "Aktív dealek",             href: "/deals",                       count: openDeals > 0 ? openDeals.toLocaleString("hu-HU") : "—" },
    { label: "Összes számla",            href: "/analytics/invoices",          count: "→", accent: "var(--mint)" },
  ];

  return (
    <div className="space-y-6">
      <div className="tabs-ds">
        <button className={`tab-ds ${activeSection === "revenue" ? "active" : ""}`} onClick={() => setActiveSection("revenue")}>
          Bevétel · 24 hónap
        </button>
        <button className={`tab-ds ${activeSection === "explorer" ? "active" : ""}`} onClick={() => setActiveSection("explorer")}>
          Adatok böngészése
        </button>
      </div>

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
                Nincs számla adat az elmúlt 24 hónapra.
              </p>
            )}
          </div>
        </div>
      )}

      {activeSection === "explorer" && (
        <div className="panel mount">
          <div className="panel-head">
            <div className="panel-title">Adatok böngészése</div>
          </div>
          <div style={{ padding: 20 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
              {entityLinks.map(({ label, href, count, accent }) => (
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
                  <span className="font-mono-ndt" style={{ fontSize: 11, color: accent ?? "var(--indigo)" }}>{count}</span>
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
