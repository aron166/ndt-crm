import { db } from "@/lib/db";
import Link from "next/link";
import { formatDate } from "@/lib/utils";

const TENANT_ID = 1;
const PAGE_SIZE = 50;

interface SearchParams { year?: string; search?: string; page?: string; }

function formatHUF(n: number) {
  return new Intl.NumberFormat("hu-HU", { maximumFractionDigits: 0 }).format(n) + " Ft";
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const yearFilter = params.year ? parseInt(params.year, 10) : null;
  const search = params.search?.trim() ?? "";
  const page = Math.max(1, parseInt(params.page ?? "1", 10));

  const yearRows = await db.$queryRaw<{ year: number }[]>`
    SELECT DISTINCT EXTRACT(YEAR FROM issued_date)::int AS year
    FROM invoices WHERE tenant_id = ${TENANT_ID} AND issued_date IS NOT NULL
    ORDER BY year DESC
  `;
  const availableYears: number[] = (yearRows as Array<{ year: number }>).map(r => r.year);

  const where = {
    tenantId: TENANT_ID,
    ...(yearFilter ? { year: yearFilter } : {}),
    ...(search ? { companyName: { contains: search, mode: "insensitive" as const } } : {}),
  };

  const [invoices, total, agg] = await Promise.all([
    db.invoice.findMany({
      where,
      include: { company: { select: { id: true, name: true } } },
      orderBy: [{ issuedDate: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.invoice.count({ where }),
    db.invoice.aggregate({ where, _sum: { netAmount: true } }),
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const totalAmount = Number(agg._sum.netAmount ?? 0);

  return (
    <div className="mount space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <h1 style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em", margin: 0, color: "var(--fg)", display: "flex", alignItems: "baseline", gap: 8 }}>
          Számlák
          <span className="font-mono-ndt" style={{ fontSize: 12, color: "var(--fg-faint)", fontWeight: 400 }}>
            {total.toLocaleString("hu-HU")}
          </span>
          {totalAmount > 0 && (
            <span className="font-mono-ndt" style={{ fontSize: 12, color: "var(--mint)", fontWeight: 400 }}>
              · {(totalAmount / 1_000_000).toFixed(1)}M HUF
            </span>
          )}
        </h1>
        <form method="GET">
          {yearFilter && <input type="hidden" name="year" value={yearFilter} />}
          <input
            name="search"
            defaultValue={search}
            placeholder="Cég neve…"
            style={{
              background: "var(--bg-panel)", border: "1px solid var(--line-soft)",
              borderRadius: 6, padding: "5px 12px", fontSize: 12, color: "var(--fg)", outline: "none", width: 200,
            }}
          />
        </form>
      </div>

      {/* Year tabs */}
      <div className="flex items-center gap-0.5 flex-wrap" style={{ background: "var(--bg-panel)", border: "1px solid var(--line-soft)", borderRadius: 6, padding: 3, width: "fit-content" }}>
        <Link
          href={search ? `/invoices?search=${search}` : "/invoices"}
          className="font-mono-ndt rounded"
          style={{ fontSize: 11, padding: "3px 10px", background: !yearFilter ? "var(--bg-hover)" : "transparent", color: !yearFilter ? "var(--fg)" : "var(--fg-mute)" }}
        >
          Mind
        </Link>
        {availableYears.map((y) => (
          <Link
            key={y}
            href={search ? `/invoices?year=${y}&search=${search}` : `/invoices?year=${y}`}
            className="font-mono-ndt rounded"
            style={{ fontSize: 11, padding: "3px 10px", background: yearFilter === y ? "var(--bg-hover)" : "transparent", color: yearFilter === y ? "var(--fg)" : "var(--fg-mute)" }}
          >
            {y}
          </Link>
        ))}
      </div>

      {/* Table */}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            {["Cég", "Számlaszám", "Kiállítás", "Összeg"].map((h, i) => (
              <th key={i} style={{
                textAlign: i === 3 ? "right" : "left",
                padding: "0 14px 8px",
                fontSize: 10, fontWeight: 600,
                textTransform: "uppercase", letterSpacing: "0.12em",
                color: "var(--fg-faint)",
                borderBottom: "1px solid var(--line-soft)",
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {invoices.length === 0 && (
            <tr>
              <td colSpan={4} style={{ padding: "48px 14px", textAlign: "center", color: "var(--fg-faint)", fontSize: 13 }}>
                Nincs találat
              </td>
            </tr>
          )}
          {invoices.map((inv) => (
            <tr key={inv.id} className="tbl-row">
              <td style={{ padding: "7px 14px", borderBottom: "1px solid var(--line-soft)" }}>
                {inv.company ? (
                  <Link href={`/companies/${inv.company.id}`} className="tbl-link" style={{ fontSize: 13 }}>
                    {inv.company.name}
                  </Link>
                ) : (
                  <span style={{ color: "var(--fg-soft)" }}>{inv.companyName ?? "—"}</span>
                )}
              </td>
              <td style={{ padding: "7px 14px", borderBottom: "1px solid var(--line-soft)" }}>
                <span className="font-mono-ndt" style={{ fontSize: 11, color: "var(--fg-faint)" }}>
                  {inv.invoiceNumber ?? "—"}
                </span>
              </td>
              <td style={{ padding: "7px 14px", borderBottom: "1px solid var(--line-soft)" }}>
                <span className="font-mono-ndt" style={{ fontSize: 11, color: "var(--fg-mute)" }}>
                  {formatDate(inv.issuedDate)}
                </span>
              </td>
              <td style={{ padding: "7px 14px", borderBottom: "1px solid var(--line-soft)", textAlign: "right" }}>
                {inv.netAmount ? (
                  <span className="font-mono-ndt" style={{ fontSize: 12, color: "var(--mint)", fontWeight: 500 }}>
                    {formatHUF(Number(inv.netAmount))}
                  </span>
                ) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {totalPages > 1 && (
        <div className="flex items-center justify-between font-mono-ndt" style={{ fontSize: 11, color: "var(--fg-faint)" }}>
          <span>{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} / {total.toLocaleString("hu-HU")}</span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={`/invoices?${yearFilter ? `year=${yearFilter}&` : ""}${search ? `search=${search}&` : ""}page=${page - 1}`}
                style={{ padding: "4px 10px", background: "var(--bg-panel)", border: "1px solid var(--line-soft)", borderRadius: 5, color: "var(--fg-soft)" }}>
                ← Előző
              </Link>
            )}
            {page < totalPages && (
              <Link href={`/invoices?${yearFilter ? `year=${yearFilter}&` : ""}${search ? `search=${search}&` : ""}page=${page + 1}`}
                style={{ padding: "4px 10px", background: "var(--bg-panel)", border: "1px solid var(--line-soft)", borderRadius: 5, color: "var(--fg-soft)" }}>
                Következő →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
