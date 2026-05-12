import { db } from "@/lib/db";
import Link from "next/link";
import { PipelineStatusBadge } from "@/components/PipelineStatusBadge";
import { formatDate } from "@/lib/utils";
import { CompaniesSearch } from "./CompaniesSearch";
import { TagFilter } from "@/components/tags/TagFilter";

const PAGE_SIZE = 25;
const TENANT_ID = 1;

interface SearchParams {
  search?: string;
  page?: string;
  fa?: string;
  tag?: string;
}

// deterministic avatar color per company id
function avatarBg(id: number) {
  const palette = [
    "oklch(0.66 0.19 278)", "oklch(0.80 0.13 165)", "oklch(0.80 0.15 75)",
    "oklch(0.78 0.12 230)", "oklch(0.72 0.16 305)", "oklch(0.72 0.18 25)",
  ];
  return palette[id % palette.length];
}

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const search = params.search?.trim() ?? "";
  const page = Math.max(1, parseInt(params.page ?? "1", 10));
  const includeFA = params.fa === "1";
  const tagName = params.tag?.trim() ?? "";

  let tagFilterIds: number[] | undefined;
  if (tagName) {
    const tag = await db.tag.findFirst({
      where: { tenantId: TENANT_ID, name: { equals: tagName, mode: "insensitive" } },
      include: { taggings: { where: { taggableType: "company" }, select: { taggableId: true } } },
    });
    tagFilterIds = tag?.taggings.map((t) => t.taggableId) ?? [];
  }

  const where = {
    tenantId: TENANT_ID,
    ...(tagFilterIds !== undefined ? { id: { in: tagFilterIds } } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { vatNumber: { contains: search, mode: "insensitive" as const } },
            { city: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(includeFA ? {} : { NOT: { name: { contains: "F.A." } } }),
  };

  const [companies, total] = await Promise.all([
    db.company.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.company.count({ where }),
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="mount">
      {/* Page header */}
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="flex items-center gap-3" style={{ fontSize: 22, fontWeight: 600, color: "var(--fg)", letterSpacing: "-0.02em", margin: 0 }}>
            Cégek
            <span className="font-mono-ndt" style={{ fontSize: 13, color: "var(--fg-mute)", fontWeight: 400 }}>
              · {total.toLocaleString("hu-HU")}
            </span>
          </h1>
          <p style={{ fontSize: 13, color: "var(--fg-mute)", marginTop: 4 }}>
            VAT-szám alapján deduplikálva. Személy-történet megmarad munkáltatóváltáskor.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CompaniesSearch search={search} includeFA={includeFA} />
          <TagFilter activeTagName={tagName || undefined} />
        </div>
      </div>

      {/* Table */}
      <div
        className="rounded-xl overflow-hidden mount mount-1"
        style={{ background: "var(--bg-panel)", border: "1px solid var(--line-soft)" }}
      >
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 13 }}>
          <thead>
            <tr>
              {["", "Cég neve", "Terület", "Pipeline", "Utolsó interakció", "Adószám"].map((h, i) => (
                <th
                  key={i}
                  style={{
                    textAlign: i > 3 ? "right" : "left",
                    padding: "10px 16px",
                    fontSize: 10, fontWeight: 600,
                    textTransform: "uppercase", letterSpacing: "0.1em",
                    color: "var(--fg-faint)",
                    borderBottom: "1px solid var(--line-soft)",
                    background: "oklch(0.20 0.014 255 / 0.5)",
                    position: "sticky", top: 0, zIndex: 1,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {companies.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: "48px 16px", textAlign: "center", color: "var(--fg-faint)" }}>
                  Nincs találat.
                </td>
              </tr>
            )}
            {companies.map((c, idx) => {
              const initials = c.name.slice(0, 2).toUpperCase();
              return (
                <tr
                  key={c.id}
                  className="tbl-row mount"
                  style={{ animationDelay: `${idx * 20}ms`, borderBottom: "1px solid var(--line-soft)" }}
                >
                  <td style={{ padding: "10px 16px", width: 48 }}>
                    <Link href={`/companies/${c.id}`}>
                      <div
                        className="font-mono-ndt flex items-center justify-center rounded-lg"
                        style={{
                          width: 32, height: 32, fontSize: 11, fontWeight: 600,
                          background: avatarBg(c.id), color: "var(--fg)",
                        }}
                      >
                        {initials}
                      </div>
                    </Link>
                  </td>
                  <td style={{ padding: "10px 16px" }}>
                    <Link href={`/companies/${c.id}`} className="tbl-link">
                      {c.name}
                    </Link>
                    {c.vatNumber && (
                      <div className="font-mono-ndt" style={{ fontSize: 11, color: "var(--fg-faint)", marginTop: 2 }}>
                        {c.vatNumber}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: "10px 16px" }}>
                    <span style={{ color: "var(--fg-soft)" }}>{c.city ?? "—"}</span>
                    {c.county && <div style={{ fontSize: 11, color: "var(--fg-faint)" }}>{c.county}</div>}
                  </td>
                  <td style={{ padding: "10px 16px" }}>
                    <PipelineStatusBadge status={c.pipelineStatus} />
                  </td>
                  <td style={{ padding: "10px 16px", textAlign: "right" }}>
                    <span className="font-mono-ndt" style={{ fontSize: 12, color: "var(--fg-mute)" }}>
                      {formatDate(c.lastInteractionDate)}
                    </span>
                  </td>
                  <td style={{ padding: "10px 16px", textAlign: "right" }}>
                    <span className="font-mono-ndt" style={{ fontSize: 11, color: "var(--fg-faint)" }}>
                      {c.vatNumber ?? "—"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 font-mono-ndt" style={{ fontSize: 12, color: "var(--fg-mute)" }}>
          <span>
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} / {total}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`/companies?search=${search}&page=${page - 1}&fa=${includeFA ? "1" : "0"}`}
                className="rounded"
                style={{ padding: "4px 12px", background: "var(--bg-panel)", border: "1px solid var(--line-soft)", color: "var(--fg-soft)" }}
              >
                ← Előző
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={`/companies?search=${search}&page=${page + 1}&fa=${includeFA ? "1" : "0"}`}
                className="rounded"
                style={{ padding: "4px 12px", background: "var(--bg-panel)", border: "1px solid var(--line-soft)", color: "var(--fg-soft)" }}
              >
                Következő →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
