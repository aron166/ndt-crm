import { db } from "@/lib/db";
import Link from "next/link";
import { PageHeader, Seg } from "@/components/astryx/PageHeader";
import k from "@/components/astryx/page.module.css";
import q from "../quotes/quotes.module.css";
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
    <div className="mount">
      <PageHeader
        title="Számlák"
        eyebrow={
          <>
            {total.toLocaleString("hu-HU")}
            {totalAmount > 0 && <span className={k.num}> · {(totalAmount / 1e6).toLocaleString("hu-HU", { maximumFractionDigits: 1 })}M HUF</span>}
          </>
        }
        views={
          <form method="GET">
            {yearFilter && <input type="hidden" name="year" value={yearFilter} />}
            <input
              name="search"
              defaultValue={search}
              placeholder="Cég neve…"
              aria-label="Cég neve" /* PROPOSAL copy */
              className={q.input}
              style={{ width: 200 }}
            />
          </form>
        }
        filters={
          <Seg
            label="Év" /* PROPOSAL copy */
            current={yearFilter ? String(yearFilter) : "all"}
            items={[
              { key: "all", label: "Mind", href: search ? `/invoices?search=${encodeURIComponent(search)}` : "/invoices" },
              ...availableYears.map((y) => ({
                key: String(y),
                label: String(y),
                href: search ? `/invoices?year=${y}&search=${encodeURIComponent(search)}` : `/invoices?year=${y}`,
              })),
            ]}
          />
        }
      />

      <div className={k.tableWrap}>
        <table className={k.table}>
          <thead>
            <tr>
              {["Cég", "Számlaszám", "Kiállítás", "Összeg"].map((h, i) => (
                <th key={i} style={i === 3 ? { textAlign: "right" } : undefined}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: "48px 14px", textAlign: "center", color: "var(--ui-text-muted)" }}>
                  Nincs találat
                </td>
              </tr>
            )}
            {invoices.map((inv) => (
              <tr key={inv.id}>
                <td>
                  {inv.company ? (
                    <Link href={`/companies/${inv.company.id}`} className={k.link}>
                      {inv.company.name}
                    </Link>
                  ) : (
                    <span>{inv.companyName ?? "-"}</span>
                  )}
                </td>
                <td>
                  <span className={q.mono}>{inv.invoiceNumber ?? "-"}</span>
                </td>
                <td className={k.num}>{formatDate(inv.issuedDate)}</td>
                <td className={q.numCell}>
                  {inv.netAmount ? formatHUF(Number(inv.netAmount)) : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className={k.pager}>
          <span className={`${k.muted} ${k.num}`}>{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} / {total.toLocaleString("hu-HU")}</span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={`/invoices?${yearFilter ? `year=${yearFilter}&` : ""}${search ? `search=${encodeURIComponent(search)}&` : ""}page=${page - 1}`}
                className={k.btn}>
                ← Előző
              </Link>
            )}
            {page < totalPages && (
              <Link href={`/invoices?${yearFilter ? `year=${yearFilter}&` : ""}${search ? `search=${encodeURIComponent(search)}&` : ""}page=${page + 1}`}
                className={k.btn}>
                Következő →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
