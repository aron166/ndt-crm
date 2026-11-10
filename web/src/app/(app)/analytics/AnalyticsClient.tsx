"use client";

import { useState } from "react";
import { AreaChart } from "@/components/viz/AreaChart";
import k from "@/components/astryx/page.module.css";
import s from "./analytics.module.css";

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
    { label: "Nyitott feladatok",         href: "/tasks?status=open",           count: openTasks > 0 ? openTasks.toLocaleString("hu-HU") : "-" },
    { label: "Aktív dealek",             href: "/deals",                       count: openDeals > 0 ? openDeals.toLocaleString("hu-HU") : "-" },
    { label: "Összes számla",            href: "/analytics/invoices",          count: "→", accent: "var(--mint)" },
  ];

  return (
    <div className="space-y-6">
      <div className={k.seg}>
        <button
          type="button"
          aria-pressed={activeSection === "revenue"}
          className={`${k.segItem} ${s.segBtn} ${activeSection === "revenue" ? k.segItemOn : ""}`}
          onClick={() => setActiveSection("revenue")}
        >
          Bevétel · 24 hónap
        </button>
        <button
          type="button"
          aria-pressed={activeSection === "explorer"}
          className={`${k.segItem} ${s.segBtn} ${activeSection === "explorer" ? k.segItemOn : ""}`}
          onClick={() => setActiveSection("explorer")}
        >
          Adatok böngészése
        </button>
      </div>

      {activeSection === "revenue" && (
        <section className={k.section}>
          <div className={s.head}>
            <h2 className={k.h2}>Havi forgalom · elmúlt 24 hónap (M HUF)</h2>
            {monthSeries.length > 0 && (
              <span className={k.num} style={{ fontSize: 14, color: "var(--mint)" }}>
                {monthSeries.reduce((sum, v) => sum + v, 0).toFixed(1)}M összesen
              </span>
            )}
          </div>
          {monthSeries.length >= 2 ? (
            <>
              <AreaChart data={monthSeries} height={180} color="var(--mint)" />
              <div className={s.years}>
                {revenueByMonth.map((r, i) => (
                  <div key={i} style={{ textAlign: "center", flexShrink: 0, minWidth: 36 }}>
                    <div className={k.num} style={{ fontSize: 14, color: r.total > 0 ? "var(--mint)" : "var(--ui-text-muted)" }}>
                      {r.total > 0 ? (r.total / 1_000_000).toFixed(0) : "-"}
                    </div>
                    <div className={s.axis}>{monthLabels[i]}</div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className={`${k.empty} ${s.center}`}>
              Nincs számla adat az elmúlt 24 hónapra.
            </p>
          )}
        </section>
      )}

      {activeSection === "explorer" && (
        <section className={k.section}>
          <h2 className={k.h2}>Adatok böngészése</h2>
          <div className={s.links}>
            {entityLinks.map(({ label, href, count, accent }) => (
              <a key={label} href={href} className={s.linkTile}>
                <span>{label}</span>
                <span className={k.num} style={{ fontSize: 14, color: accent ?? "var(--ui-accent)" }}>{count}</span>
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
