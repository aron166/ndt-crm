import { db } from "@/lib/db";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import { PageHeader, Seg } from "@/components/astryx/PageHeader";
import k from "@/components/astryx/page.module.css";
import s from "../analytics.module.css";

const TENANT_ID = 1;
const YEAR_LABEL = "Év"; // PROPOSAL copy

interface SearchParams {
  year?: string;
  search?: string;
}

function formatHUF(n: number) {
  return new Intl.NumberFormat("hu-HU", { style: "decimal", maximumFractionDigits: 0 }).format(n) + " Ft";
}

export default async function InvoicesDrillPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const yearFilter = params.year ? parseInt(params.year, 10) : null;
  const search = params.search?.trim() ?? "";

  // available years
  const yearRows = await db.$queryRaw<{ year: number }[]>`
    SELECT DISTINCT EXTRACT(YEAR FROM issued_date)::int AS year
    FROM invoices
    WHERE tenant_id = ${TENANT_ID} AND issued_date IS NOT NULL
    ORDER BY year DESC
  `;
  const availableYears: number[] = (yearRows as Array<{ year: number }>).map(r => r.year);

  const summaryWhere = {
    tenantId: TENANT_ID,
    netAmount: { not: null },
    ...(yearFilter ? { year: yearFilter } : {}),
    ...(search ? {
      companyName: { contains: search, mode: "insensitive" as const },
    } : {}),
  };

  const [invoices, summaryAgg] = await Promise.all([
    db.invoice.findMany({
      where: summaryWhere,
      include: { company: { select: { id: true, name: true } } },
      orderBy: [{ netAmount: "desc" }],
      take: 200,
    }),
    db.invoice.aggregate({
      where: summaryWhere,
      _sum: { netAmount: true },
      _count: { id: true },
    }),
  ]);

  const totalAmount = Number(summaryAgg._sum.netAmount ?? 0);
  const invoiceCount = summaryAgg._count.id;

  const yearItems = [
    { key: "all", label: "Mind", href: search ? `/analytics/invoices?search=${search}` : "/analytics/invoices" },
    ...availableYears.map((y) => ({
      key: String(y),
      label: String(y),
      href: search ? `/analytics/invoices?year=${y}&search=${search}` : `/analytics/invoices?year=${y}`,
    })),
  ];

  return (
    <div className="mount space-y-6">
      <Link href="/analytics" className={k.back}>
        ← Analytics
      </Link>

      <PageHeader
        title="Számlák"
        eyebrow={
          <>
            {invoiceCount.toLocaleString("hu-HU")} számla ·{" "}
            <span className={k.num} style={{ color: "var(--ui-text)" }}>
              {(totalAmount / 1_000_000).toFixed(1)}M HUF
            </span>
            {yearFilter && <span className={k.muted}> · {yearFilter}</span>}
          </>
        }
        filters={
          <>
            {/* Year tabs */}
            <Seg
              label={YEAR_LABEL}
              current={yearFilter ? String(yearFilter) : "all"}
              items={yearItems}
            />

            {/* Search */}
            <form method="GET">
              {yearFilter && <input type="hidden" name="year" value={yearFilter} />}
              <input
                name="search"
                defaultValue={search}
                placeholder="Cég neve..."
                className={s.field}
              />
            </form>
          </>
        }
      />

      {/* Invoice table */}
      <div>
        <div className={k.tableWrap}>
          <table className={k.table}>
            <thead>
              <tr>
                <th>Cég</th>
                <th>Számlaszám</th>
                <th className={s.right}>Nettó összeg</th>
                <th className={s.right}>Kiállítás dátuma</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 && (
                <tr>
                  <td colSpan={4} className={`${s.emptyCell} ${k.muted}`}>
                    Nincs találat.
                  </td>
                </tr>
              )}
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td>
                    {inv.company ? (
                      <Link href={`/companies/${inv.company.id}`} className={s.cellName}>
                        {inv.company.name}
                      </Link>
                    ) : (
                      inv.companyName ?? "-"
                    )}
                  </td>
                  <td>
                    <span className={k.muted}>
                      {inv.invoiceNumber ?? "-"}
                    </span>
                  </td>
                  <td className={s.right}>
                    <span className={k.num} style={{ color: "var(--ui-text)", fontWeight: 500 }}>
                      {inv.netAmount ? formatHUF(Number(inv.netAmount)) : "-"}
                    </span>
                  </td>
                  <td className={s.right}>
                    <span className={`${k.muted} ${k.num}`}>
                      {formatDate(inv.issuedDate)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {invoiceCount > 200 && (
          <div className={`${k.muted} ${s.note}`}>
            Első 200 találat megjelenítve · {invoiceCount.toLocaleString("hu-HU")} összesen
          </div>
        )}
      </div>
    </div>
  );
}
