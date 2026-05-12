import { db } from "@/lib/db";
import Link from "next/link";
import { AreaChart } from "@/components/viz/AreaChart";
import { Sparkline } from "@/components/viz/Sparkline";
import { StackBar } from "@/components/viz/StackBar";
import { PipelineStatusBadge } from "@/components/PipelineStatusBadge";
import { formatDate } from "@/lib/utils";
import { serializeDates } from "@/lib/serialize";
import { AnalyticsClient } from "./AnalyticsClient";

const TENANT_ID = 1;

const PIPELINE_COLORS: Record<number, string> = {
  0: "var(--fg-faint)",
  1: "var(--sky)",
  2: "var(--amber)",
  3: "var(--mint)",
  4: "var(--coral)",
  5: "var(--violet)",
  6: "var(--indigo)",
  7: "var(--fg-faint)",
  8: "var(--mint)",
};

interface SearchParams { range?: string; }

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const range = params.range ?? "ytd";

  const now = new Date();
  const rangeStart =
    range === "7d"      ? new Date(now.getTime() - 7 * 86400000) :
    range === "30d"     ? new Date(now.getTime() - 30 * 86400000) :
    range === "90d"     ? new Date(now.getTime() - 90 * 86400000) :
    range === "quarter" ? new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1) :
    new Date(now.getFullYear(), 0, 1); // YTD

  // ── KPI queries ────────────────────────────────────────────
  const [
    totalCompanies,
    totalPersons,
    contacted,
    neverContacted,
    recentInteractions,
    openTasks,
    pipelineDistribution,
  ] = await Promise.all([
    db.company.count({ where: { tenantId: TENANT_ID } }),
    db.person.count({ where: { tenantId: TENANT_ID } }),
    db.company.count({
      where: { tenantId: TENANT_ID, lastInteractionDate: { not: null } },
    }),
    db.company.count({
      where: { tenantId: TENANT_ID, lastInteractionDate: null },
    }),
    db.interaction.count({
      where: { tenantId: TENANT_ID, occurredAt: { gte: rangeStart } },
    }),
    db.task.count({
      where: {
        tenantId: TENANT_ID,
        status: { in: ["created", "in_progress"] },
        parentTaskId: null,
      },
    }),
    db.$queryRaw<{ status: string | null; count: bigint }[]>`
      SELECT pipeline_status as status, COUNT(*) as count
      FROM companies WHERE tenant_id = ${TENANT_ID}
      GROUP BY pipeline_status ORDER BY pipeline_status
    `,
  ]);

  // ── Revenue by year ────────────────────────────────────────
  const revenueByYear = await db.$queryRaw<{ year: number; total: number }[]>`
    SELECT
      EXTRACT(YEAR FROM issued_date)::int AS year,
      SUM(net_amount::numeric)::float AS total
    FROM invoices
    WHERE tenant_id = ${TENANT_ID} AND issued_date IS NOT NULL AND net_amount IS NOT NULL
    GROUP BY year ORDER BY year
  `;

  // ── Revenue by month (last 24 months) ─────────────────────
  const revenueByMonth = await db.$queryRaw<{ month: string; total: number }[]>`
    SELECT
      TO_CHAR(issued_date, 'YYYY-MM') AS month,
      SUM(net_amount::numeric)::float AS total
    FROM invoices
    WHERE tenant_id = ${TENANT_ID}
      AND issued_date >= NOW() - INTERVAL '24 months'
      AND net_amount IS NOT NULL
    GROUP BY month ORDER BY month
  `;

  // ── Top 10 companies by revenue ────────────────────────────
  const topCompaniesByRevenue = await db.$queryRaw<{
    company_id: number | null; company_name: string | null; total: number;
  }[]>`
    SELECT company_id, company_name, SUM(net_amount::numeric)::float AS total
    FROM invoices
    WHERE tenant_id = ${TENANT_ID} AND net_amount IS NOT NULL
    GROUP BY company_id, company_name
    ORDER BY total DESC LIMIT 10
  `;

  // ── Companies needing contact (never or >90 days ago) ─────
  const coldCompanies = await db.company.findMany({
    where: {
      tenantId: TENANT_ID,
      OR: [
        { lastInteractionDate: null },
        { lastInteractionDate: { lt: new Date(now.getTime() - 90 * 86400000) } },
      ],
      pipelineStatus: { in: ["1", "2", "3", "5", "6"] }, // active stages only
    },
    select: { id: true, name: true, city: true, pipelineStatus: true, lastInteractionDate: true },
    orderBy: { lastInteractionDate: "asc" },
    take: 20,
  });

  // ── Derived ────────────────────────────────────────────────
  const totalRevenue = revenueByYear.reduce((s, r) => s + r.total, 0);
  const revenueSeries = revenueByYear.map((r) => r.total / 1_000_000); // in millions
  const revenueMonthSeries = revenueByMonth.map((r) => r.total / 1_000_000);

  const pipelineItems = pipelineDistribution.map((row) => ({
    status: row.status ?? "",
    count: Number(row.count),
    color: PIPELINE_COLORS[parseInt(row.status ?? "1")] ?? "var(--fg-faint)",
  }));

  return (
    <div className="mount space-y-8">
      {/* Header */}
      <div className="page-head">
        <div>
          <h1 className="page-title">
            Analytics
            <span className="font-mono-ndt" style={{ fontSize: 13, color: "var(--fg-mute)", fontWeight: 400 }}>
              · Controllabor Kft.
            </span>
          </h1>
          <p className="page-sub">Valós adatok az adatbázisból. Minden szám kattintható.</p>
        </div>

        {/* Time range selector */}
        <div className="flex items-center gap-1" style={{ background: "var(--bg-panel)", border: "1px solid var(--line-soft)", borderRadius: 6, padding: 2 }}>
          {[
            { key: "7d",      label: "7 nap" },
            { key: "30d",     label: "30 nap" },
            { key: "90d",     label: "90 nap" },
            { key: "quarter", label: "Negyedév" },
            { key: "ytd",     label: "YTD" },
          ].map(({ key, label }) => (
            <Link
              key={key}
              href={`/analytics?range=${key}`}
              className="font-mono-ndt rounded"
              style={{
                fontSize: 11, padding: "3px 10px",
                background: range === key ? "var(--bg-hover)" : "transparent",
                color: range === key ? "var(--fg)" : "var(--fg-mute)",
              }}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      {/* KPI Strip */}
      <div className="kpi-grid mount mount-1">
        <Link href="/companies" className="kpi" style={{ "--accent": "var(--indigo)" } as React.CSSProperties}>
          <div className="k-label">Cégek</div>
          <div className="k-value font-mono-ndt">{totalCompanies.toLocaleString("hu-HU")}</div>
          <div style={{ fontSize: 11, color: "var(--fg-faint)", marginTop: 4 }}>
            {contacted.toLocaleString("hu-HU")} érintett · {neverContacted.toLocaleString("hu-HU")} soha
          </div>
          <div className="k-spark">
            <Sparkline data={pipelineItems.map((p) => p.count)} width={80} height={28} color="var(--indigo)" />
          </div>
        </Link>

        <Link href="/persons" className="kpi" style={{ "--accent": "var(--sky)" } as React.CSSProperties}>
          <div className="k-label">Személyek</div>
          <div className="k-value font-mono-ndt">{totalPersons.toLocaleString("hu-HU")}</div>
          <div style={{ fontSize: 11, color: "var(--fg-faint)", marginTop: 4 }}>
            2023-as kontakt snapshot
          </div>
        </Link>

        <div className="kpi" style={{ "--accent": "var(--mint)" } as React.CSSProperties}>
          <div className="k-label">Összbevétel (HUF)</div>
          <div className="k-value font-mono-ndt" style={{ fontSize: 22 }}>
            {(totalRevenue / 1_000_000).toFixed(1)}M
          </div>
          <div style={{ fontSize: 11, color: "var(--fg-faint)", marginTop: 4 }}>2010–2023 · 2016 számla</div>
          <div className="k-spark">
            <Sparkline data={revenueSeries.slice(-12)} width={80} height={28} color="var(--mint)" />
          </div>
        </div>

        <Link href={`/analytics?range=${range}#interactions`} className="kpi" style={{ "--accent": "var(--amber)" } as React.CSSProperties}>
          <div className="k-label">Interakciók ({range.toUpperCase()})</div>
          <div className="k-value font-mono-ndt">{recentInteractions.toLocaleString("hu-HU")}</div>
          <div style={{ fontSize: 11, color: "var(--fg-faint)", marginTop: 4 }}>
            {openTasks > 0 ? `${openTasks} nyitott feladat` : "Nincs nyitott feladat"}
          </div>
        </Link>
      </div>

      {/* Pipeline coverage strip */}
      <div className="panel mount mount-2">
        <div className="panel-head">
          <div className="panel-title">Pipeline státusz megoszlás</div>
          <span className="font-mono-ndt" style={{ fontSize: 11, color: "var(--fg-mute)" }}>
            {totalCompanies.toLocaleString("hu-HU")} cég
          </span>
        </div>
        <div className="panel-pad space-y-4">
          <StackBar
            segments={pipelineItems.filter((p) => p.count > 0).map((p) => ({
              label: p.status,
              value: p.count,
              color: p.color,
            }))}
            height={12}
          />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            {pipelineItems.filter((p) => p.count > 0).map((p) => (
              <Link
                key={p.status}
                href={`/companies?pipeline_status=${p.status}`}
                className="flex items-center gap-2"
                style={{ fontSize: 12, color: "var(--fg-soft)" }}
              >
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.color, flexShrink: 0, boxShadow: `0 0 4px ${p.color}` }} />
                <PipelineStatusBadge status={p.status} />
                <span className="font-mono-ndt ml-auto" style={{ fontSize: 11, color: "var(--fg-mute)" }}>
                  {p.count.toLocaleString("hu-HU")}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Revenue chart */}
      <div className="panel mount mount-3">
        <div className="panel-head">
          <div className="panel-title">Forgalom · éves bontás (M HUF)</div>
          <span className="font-mono-ndt" style={{ fontSize: 11, color: "var(--mint)" }}>
            {(totalRevenue / 1_000_000).toFixed(1)}M HUF összesen
          </span>
        </div>
        <div style={{ padding: 20 }}>
          <AreaChart data={revenueSeries} height={200} color="var(--indigo)" />
          <div style={{ display: "flex", gap: 8, marginTop: 12, overflowX: "auto", paddingBottom: 4 }}>
            {revenueByYear.map((r) => (
              <div key={r.year} style={{ textAlign: "center", flexShrink: 0, minWidth: 44 }}>
                <div className="font-mono-ndt" style={{ fontSize: 11, color: "var(--mint)", fontWeight: 500 }}>
                  {(r.total / 1_000_000).toFixed(0)}M
                </div>
                <div style={{ fontSize: 10, color: "var(--fg-faint)" }}>{r.year}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top companies + cold companies side by side */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Top companies by revenue */}
        <div className="panel mount mount-4">
          <div className="panel-head">
            <div className="panel-title">Top cégek bevétel szerint</div>
          </div>
          <table className="tbl">
            <thead>
              <tr>
                <th>Cég</th>
                <th style={{ textAlign: "right" }}>Bevétel (M HUF)</th>
              </tr>
            </thead>
            <tbody>
              {topCompaniesByRevenue.map((row, i) => (
                <tr key={i}>
                  <td className="name">
                    {row.company_id ? (
                      <Link href={`/companies/${row.company_id}`} className="row-link">
                        {row.company_name ?? "—"}
                      </Link>
                    ) : (
                      <span style={{ color: "var(--fg-soft)" }}>{row.company_name ?? "—"}</span>
                    )}
                  </td>
                  <td className="num" style={{ textAlign: "right", color: "var(--mint)" }}>
                    {(row.total / 1_000_000).toFixed(2)}M
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Cold companies — actionable */}
        <div className="panel mount mount-4">
          <div className="panel-head">
            <div className="panel-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--amber)", boxShadow: "0 0 6px var(--amber)" }} />
              Hívandók (90+ nap inaktív)
            </div>
            <span className="font-mono-ndt" style={{ fontSize: 11, color: "var(--coral)" }}>
              {coldCompanies.length} cég
            </span>
          </div>
          <div style={{ maxHeight: 400, overflowY: "auto" }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Cég</th>
                  <th>Utolsó kontakt</th>
                </tr>
              </thead>
              <tbody>
                {coldCompanies.map((c) => (
                  <tr key={c.id}>
                    <td className="name">
                      <Link href={`/companies/${c.id}`} className="row-link">{c.name}</Link>
                      {c.city && <div className="sub">{c.city}</div>}
                    </td>
                    <td>
                      {c.lastInteractionDate ? (
                        <span className="font-mono-ndt" style={{ fontSize: 11, color: "var(--amber)" }}>
                          {formatDate(c.lastInteractionDate)}
                        </span>
                      ) : (
                        <span className="font-mono-ndt" style={{ fontSize: 11, color: "var(--coral)" }}>Soha</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Data explorer — client-side filterable tables */}
      <AnalyticsClient
        revenueByMonth={serializeDates(revenueByMonth)}
      />
    </div>
  );
}
