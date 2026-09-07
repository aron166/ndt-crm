import { db } from "@/lib/db";
import Link from "next/link";
import { formatDate } from "@/lib/utils";

const TENANT_ID = 1;

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

  return (
    <div className="mount space-y-6">
      {/* Header */}
      <div className="page-head">
        <div>
          <div className="flex items-center gap-3">
            <Link href="/analytics" style={{ fontSize: 14, color: "var(--fg-faint)", textDecoration: "none" }}>
              ← Analytics
            </Link>
            <span style={{ color: "var(--line-soft)" }}>/</span>
            <h1 className="page-title" style={{ margin: 0 }}>Számlák</h1>
          </div>
          <p className="page-sub">
            {invoiceCount.toLocaleString("hu-HU")} számla ·{" "}
            <span className="font-mono-ndt" style={{ color: "var(--mint)" }}>
              {(totalAmount / 1_000_000).toFixed(1)}M HUF
            </span>
            {yearFilter && <span style={{ color: "var(--fg-faint)" }}> · {yearFilter}</span>}
          </p>
        </div>

        {/* Search */}
        <form method="GET">
          {yearFilter && <input type="hidden" name="year" value={yearFilter} />}
          <input
            name="search"
            defaultValue={search}
            placeholder="Cég neve..."
            style={{
              background: "var(--bg-panel)", border: "1px solid var(--line-soft)", borderRadius: 6,
              padding: "6px 12px", fontSize: 14, color: "var(--fg)", outline: "none", width: 200,
            }}
          />
        </form>
      </div>

      {/* Year tabs */}
      <div className="flex items-center gap-1 flex-wrap" style={{ background: "var(--bg-panel)", border: "1px solid var(--line-soft)", borderRadius: 6, padding: 4, width: "fit-content" }}>
        <Link
          href={search ? `/analytics/invoices?search=${search}` : "/analytics/invoices"}
          className="font-mono-ndt rounded"
          style={{
            fontSize: 12, padding: "3px 10px",
            background: !yearFilter ? "var(--bg-hover)" : "transparent",
            color: !yearFilter ? "var(--fg)" : "var(--fg-mute)",
          }}
        >
          Mind
        </Link>
        {availableYears.map((y) => (
          <Link
            key={y}
            href={search ? `/analytics/invoices?year=${y}&search=${search}` : `/analytics/invoices?year=${y}`}
            className="font-mono-ndt rounded"
            style={{
              fontSize: 12, padding: "3px 10px",
              background: yearFilter === y ? "var(--bg-hover)" : "transparent",
              color: yearFilter === y ? "var(--fg)" : "var(--fg-mute)",
            }}
          >
            {y}
          </Link>
        ))}
      </div>

      {/* Invoice table */}
      <div className="panel mount">
        <table className="tbl" style={{ width: "100%" }}>
          <thead>
            <tr>
              <th>Cég</th>
              <th>Számlaszám</th>
              <th style={{ textAlign: "right" }}>Nettó összeg</th>
              <th style={{ textAlign: "right" }}>Kiállítás dátuma</th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: "48px 16px", textAlign: "center", color: "var(--fg-faint)" }}>
                  Nincs találat.
                </td>
              </tr>
            )}
            {invoices.map((inv) => (
              <tr key={inv.id}>
                <td className="name">
                  {inv.company ? (
                    <Link href={`/companies/${inv.company.id}`} className="row-link">
                      {inv.company.name}
                    </Link>
                  ) : (
                    <span style={{ color: "var(--fg-soft)" }}>{inv.companyName ?? "—"}</span>
                  )}
                </td>
                <td>
                  <span className="font-mono-ndt" style={{ fontSize: 12, color: "var(--fg-faint)" }}>
                    {inv.invoiceNumber ?? "—"}
                  </span>
                </td>
                <td style={{ textAlign: "right" }}>
                  <span className="font-mono-ndt" style={{ fontSize: 14, color: "var(--mint)", fontWeight: 500 }}>
                    {inv.netAmount ? formatHUF(Number(inv.netAmount)) : "—"}
                  </span>
                </td>
                <td style={{ textAlign: "right" }}>
                  <span className="font-mono-ndt" style={{ fontSize: 12, color: "var(--fg-mute)" }}>
                    {formatDate(inv.issuedDate)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {invoiceCount > 200 && (
          <div style={{ padding: "12px 16px", fontSize: 12, color: "var(--fg-faint)", borderTop: "1px solid var(--line-soft)", textAlign: "center" }}>
            Első 200 találat megjelenítve · {invoiceCount.toLocaleString("hu-HU")} összesen
          </div>
        )}
      </div>
    </div>
  );
}
