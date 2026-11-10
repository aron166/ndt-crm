import { db } from "@/lib/db";
import Link from "next/link";
import { AreaChart } from "@/components/viz/AreaChart";
import { Sparkline } from "@/components/viz/Sparkline";
import { StackBar } from "@/components/viz/StackBar";
import { PipelineStatusBadge } from "@/components/PipelineStatusBadge";
import { formatDate } from "@/lib/utils";
import { serializeDates } from "@/lib/serialize";
import { PageHeader, Seg } from "@/components/astryx/PageHeader";
import k from "@/components/astryx/page.module.css";
import s from "./analytics.module.css";
import { AnalyticsClient } from "./AnalyticsClient";

const TENANT_ID = 1;

const PIPELINE_COLORS: Record<number, string> = {
  0: "var(--ui-text-muted)",
  1: "var(--ui-chart-4)",
  2: "var(--ui-chart-4)",
  3: "var(--ui-chart-2)",
  4: "var(--ui-text-muted)",
  5: "var(--ui-chart-3)",
  6: "var(--ui-chart-1)",
  7: "var(--ui-text-muted)",
  8: "var(--ui-success)",
};

const RANGE_LABEL = "Időszak"; // PROPOSAL copy
const RANGE_ITEMS = [
  { key: "7d",      label: "7 nap" },
  { key: "30d",     label: "30 nap" },
  { key: "90d",     label: "90 nap" },
  { key: "quarter", label: "Negyedév" },
  { key: "ytd",     label: "YTD" },
];

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
    openDeals,
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
    db.deal.count({
      where: {
        tenantId: TENANT_ID,
        stage: { isTerminalWon: false, isTerminalLost: false },
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
    GROUP BY EXTRACT(YEAR FROM issued_date)
    ORDER BY year
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
    GROUP BY TO_CHAR(issued_date, 'YYYY-MM')
    ORDER BY month
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
  const totalRevenue = revenueByYear.reduce((sum, r) => sum + r.total, 0);
  const revenueSeries = revenueByYear.map((r) => r.total / 1_000_000); // in millions
  const revenueMonthSeries = revenueByMonth.map((r) => r.total / 1_000_000);

  const pipelineItems = pipelineDistribution.map((row) => ({
    status: row.status ?? "",
    count: Number(row.count),
    color: PIPELINE_COLORS[parseInt(row.status ?? "1")] ?? "var(--ui-text-muted)",
  }));

  return (
    <div className={`mount ${s.page}`}>
      <PageHeader
        title={<>Analytics<span className={k.muted}> · Controllabor Kft.</span></>}
        help="Valós adatok az adatbázisból. Minden szám kattintható."
        views={
          <Seg
            label={RANGE_LABEL}
            current={range}
            items={RANGE_ITEMS.map((it) => ({ ...it, href: `/analytics?range=${it.key}` }))}
          />
        }
      />

      {/* KPI strip */}
      <div className={`mount mount-1 ${s.kpis}`}>
        <div className={`${k.card} ${k.stat}`}>
          <Link href="/companies" className={`${k.statK} ${s.plain}`}>Cégek</Link>
          <Link href="/companies" className={`${k.statV} ${s.plain}`}>
            {totalCompanies.toLocaleString("hu-HU")}
          </Link>
          <span className={k.muted}>
            {contacted.toLocaleString("hu-HU")} érintett ·{" "}
            <Link href="/companies?never_contacted=1" className={s.plain} style={{ color: "var(--ui-warning-text)" }}>
              {neverContacted.toLocaleString("hu-HU")} soha
            </Link>
          </span>
          <div className={s.spark}>
            <Sparkline data={pipelineItems.map((p) => p.count)} width={80} height={28} color="var(--ui-accent)" />
          </div>
        </div>

        <Link href="/persons" className={`${k.card} ${k.stat} ${s.plain}`}>
          <span className={k.statK}>Személyek</span>
          <span className={k.statV}>{totalPersons.toLocaleString("hu-HU")}</span>
          <span className={k.muted}>2023-as kontakt snapshot</span>
        </Link>

        <Link href="/analytics/invoices" className={`${k.card} ${k.stat} ${s.plain}`}>
          <span className={k.statK}>Összbevétel (HUF)</span>
          <span className={k.statV}>{(totalRevenue / 1_000_000).toFixed(1)}M</span>
          <span className={k.muted}>2010–2023 · 2016 számla</span>
          <div className={s.spark}>
            <Sparkline data={revenueSeries.slice(-12)} width={80} height={28} color="var(--ui-chart-1)" />
          </div>
        </Link>

        <Link href={`/analytics?range=${range}#interactions`} className={`${k.card} ${k.stat} ${s.plain}`}>
          <span className={k.statK}>Interakciók ({range.toUpperCase()})</span>
          <span className={k.statV}>{recentInteractions.toLocaleString("hu-HU")}</span>
          <span className={k.muted}>
            {openTasks > 0 ? `${openTasks} nyitott feladat` : "Nincs nyitott feladat"}
          </span>
        </Link>
      </div>

      {/* Pipeline coverage strip */}
      <section className={`${k.section} mount mount-2`}>
        <div className={s.head}>
          <h2 className={k.h2}>Pipeline státusz megoszlás</h2>
          <span className={k.muted}>
            {totalCompanies.toLocaleString("hu-HU")} cég
          </span>
        </div>
        <StackBar
          segments={pipelineItems.filter((p) => p.count > 0).map((p) => ({
            label: p.status,
            value: p.count,
            color: p.color,
          }))}
          height={12}
        />
        <div className={s.pipeGrid}>
          {pipelineItems.filter((p) => p.count > 0).map((p) => (
            <Link
              key={p.status}
              href={`/companies?pipeline_status=${p.status}`}
              className={s.pipeItem}
            >
              <span className={s.dot} style={{ background: p.color }} />
              <PipelineStatusBadge status={p.status} />
              <span className={`${s.count} ${k.num}`}>
                {p.count.toLocaleString("hu-HU")}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Revenue chart */}
      <section className={`${k.section} mount mount-3`}>
        <div className={s.head}>
          <h2 className={k.h2}>Forgalom · éves bontás (M HUF)</h2>
          <span className={k.num} style={{ fontSize: 14, color: "var(--ui-text)" }}>
            {(totalRevenue / 1_000_000).toFixed(1)}M HUF összesen
          </span>
        </div>
        <AreaChart data={revenueSeries} height={200} color="var(--ui-accent)" />
        <div className={s.years}>
          {revenueByYear.map((r) => (
            <Link
              key={r.year}
              href={`/analytics/invoices?year=${r.year}`}
              className={s.year}
              title={`Számlák: ${r.year}`}
            >
              <span className={k.num} style={{ fontSize: 14, color: "var(--ui-text)", fontWeight: 500 }}>
                {(r.total / 1_000_000).toFixed(0)}M
              </span>
              <span className={k.muted}>{r.year}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Top companies + cold companies side by side */}
      <div className={s.pair}>
        {/* Top companies by revenue */}
        <section className={`${k.section} mount`}>
          <h2 className={k.h2}>Top cégek bevétel szerint</h2>
          <div className={k.tableWrap}>
            <table className={k.table} style={{ minWidth: 0 }}>
              <thead>
                <tr>
                  <th>Cég</th>
                  <th className={s.right}>Bevétel (M HUF)</th>
                </tr>
              </thead>
              <tbody>
                {topCompaniesByRevenue.map((row, i) => (
                  <tr key={i}>
                    <td>
                      {row.company_id ? (
                        <Link href={`/companies/${row.company_id}`} className={s.cellName}>
                          {row.company_name ?? "-"}
                        </Link>
                      ) : (
                        <span style={{ color: "var(--ui-text)" }}>{row.company_name ?? "-"}</span>
                      )}
                    </td>
                    <td className={`${s.right} ${k.num}`} style={{ color: "var(--ui-text)" }}>
                      {(row.total / 1_000_000).toFixed(2)}M
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Cold companies — actionable */}
        <section className={`${k.section} mount`}>
          <div className={s.head}>
            <h2 className={k.h2} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--ui-warning)" }} />
              Hívandók (90+ nap inaktív)
            </h2>
            <span className={k.num} style={{ fontSize: 14, color: "var(--ui-danger-text)" }}>
              {coldCompanies.length} cég
            </span>
          </div>
          <div className={`${k.tableWrap} ${s.scroll}`}>
            <table className={k.table} style={{ minWidth: 0 }}>
              <thead>
                <tr>
                  <th>Cég</th>
                  <th>Utolsó kontakt</th>
                </tr>
              </thead>
              <tbody>
                {coldCompanies.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/companies/${c.id}`} className={s.cellName}>{c.name}</Link>
                      {c.city && <div className={k.muted}>{c.city}</div>}
                    </td>
                    <td>
                      {c.lastInteractionDate ? (
                        <span className={k.num} style={{ fontSize: 14, color: "var(--ui-warning-text)" }}>
                          {formatDate(c.lastInteractionDate)}
                        </span>
                      ) : (
                        <span className={k.num} style={{ fontSize: 14, color: "var(--ui-danger-text)" }}>Soha</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Data explorer — client-side filterable tables */}
      <div style={{ marginBlockStart: 8 }}>
        <AnalyticsClient
          revenueByMonth={serializeDates(revenueByMonth)}
          totalCompanies={totalCompanies}
          totalPersons={totalPersons}
          neverContacted={neverContacted}
          openTasks={openTasks}
          openDeals={openDeals}
        />
      </div>
    </div>
  );
}
