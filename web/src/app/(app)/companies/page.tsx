import { db } from "@/lib/db";
import Link from "next/link";
import { PipelineStatusBadge } from "@/components/PipelineStatusBadge";
import { formatRelativeTime, contactFreshness } from "@/lib/utils";
import { CompaniesSearch } from "./CompaniesSearch";
import { TagFilter } from "@/components/tags/TagFilter";
import { SavedViewsDropdown } from "@/components/SavedViewsDropdown";
import { getSavedViews } from "@/app/actions/saved-views";

const PAGE_SIZE = 30;
const TENANT_ID = 1;

function avatarBg(id: number) {
  const palette = [
    "oklch(0.66 0.19 278)", "oklch(0.80 0.13 165)", "oklch(0.80 0.15 75)",
    "oklch(0.78 0.12 230)", "oklch(0.72 0.16 305)", "oklch(0.72 0.18 25)",
  ];
  return palette[id % palette.length];
}

const FRESHNESS_COLOR: Record<string, string> = {
  mint:   "var(--mint)",
  mute:   "var(--fg-mute)",
  amber:  "var(--amber)",
  coral:  "var(--coral)",
};

interface SearchParams {
  search?: string;
  page?: string;
  fa?: string;
  tag?: string;
  never_contacted?: string;
  pipeline_status?: string;
}

const PIPELINE_LABELS: Record<string, string> = {
  "0": "KUKA", "1": "Nem hívtuk", "2": "Nem válasz",
  "3": "Érdekli", "4": "Nem kell", "5": "Kéri",
  "6": "Függőben", "7": "Elveszett", "8": "Nyert",
};

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
  const neverContacted = params.never_contacted === "1";
  const pipelineStatus = params.pipeline_status?.trim() ?? "";

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
    ...(neverContacted ? { lastInteractionDate: null } : {}),
    ...(pipelineStatus ? { pipelineStatus } : {}),
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

  const [companies, total, savedViews] = await Promise.all([
    db.company.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.company.count({ where }),
    getSavedViews("company"),
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="mount">
      {/* Active filter pill */}
      {(neverContacted || pipelineStatus) && (
        <div className="flex items-center gap-2 mb-4" style={{ fontSize: 12 }}>
          <span style={{ color: "var(--fg-faint)" }}>Szűrő:</span>
          {neverContacted && (
            <span style={{ padding: "2px 8px", borderRadius: 20, background: "oklch(0.35 0.08 60 / 0.3)", color: "var(--amber)", fontSize: 11, fontFamily: "var(--font-mono)" }}>
              soha nem hívtuk
            </span>
          )}
          {pipelineStatus && (
            <span style={{ padding: "2px 8px", borderRadius: 20, background: "var(--indigo-soft)", color: "var(--indigo)", fontSize: 11, fontFamily: "var(--font-mono)" }}>
              {PIPELINE_LABELS[pipelineStatus] ?? pipelineStatus}
            </span>
          )}
          <Link href="/companies" style={{ color: "var(--fg-faint)", marginLeft: 4, fontSize: 11 }}>× törlés</Link>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-5">
        <h1 style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em", margin: 0, color: "var(--fg)", display: "flex", alignItems: "baseline", gap: 8 }}>
          Cégek
          <span className="font-mono-ndt" style={{ fontSize: 12, color: "var(--fg-faint)", fontWeight: 400 }}>
            {total.toLocaleString("hu-HU")}
          </span>
        </h1>
        <div className="flex items-center gap-2">
          <CompaniesSearch search={search} includeFA={includeFA} neverContacted={neverContacted} pipelineStatus={pipelineStatus || undefined} />
          <TagFilter activeTagName={tagName || undefined} />
          <SavedViewsDropdown
            entityType="company"
            basePath="/companies"
            currentParams={{
              ...(search           ? { search }                              : {}),
              ...(neverContacted   ? { never_contacted: "1" }               : {}),
              ...(pipelineStatus   ? { pipeline_status: pipelineStatus }    : {}),
              ...(tagName          ? { tag: tagName }                       : {}),
              ...(includeFA        ? { fa: "1" }                            : {}),
            }}
            views={savedViews}
          />
        </div>
      </div>

      {/* Table — no outer card, rows float on the page */}
      <table className="mount mount-1" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            {["", "Cég", "Pipeline", "Területe"].map((h, i) => (
              <th
                key={i}
                style={{
                  textAlign: "left",
                  padding: "0 14px 8px",
                  fontSize: 10, fontWeight: 600,
                  textTransform: "uppercase", letterSpacing: "0.12em",
                  color: "var(--fg-faint)",
                  borderBottom: "1px solid var(--line-soft)",
                  whiteSpace: "nowrap",
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
              <td colSpan={4} style={{ padding: "56px 14px", textAlign: "center" }}>
                <div style={{ color: "var(--fg-faint)", fontSize: 13 }}>Nincs találat</div>
                {search && (
                  <div style={{ marginTop: 6, fontSize: 12, color: "var(--fg-faint)" }}>
                    <Link href="/companies" style={{ color: "var(--indigo)" }}>Szűrő törlése</Link>
                  </div>
                )}
              </td>
            </tr>
          )}
          {companies.map((c, idx) => {
            const initials = c.name.slice(0, 2).toUpperCase();
            const freshness = contactFreshness(c.lastInteractionDate);
            const relTime = formatRelativeTime(c.lastInteractionDate);
            const isTerminal = c.pipelineStatus === "7" || c.pipelineStatus === "8" || c.pipelineStatus === "0";

            return (
              <tr
                key={c.id}
                className="tbl-row mount"
                style={{ animationDelay: `${Math.min(idx * 15, 300)}ms` }}
              >
                {/* Avatar */}
                <td style={{ padding: "7px 14px", width: 40, borderBottom: "1px solid var(--line-soft)" }}>
                  <Link href={`/companies/${c.id}`}>
                    <div
                      className="font-mono-ndt flex items-center justify-center"
                      style={{
                        width: 28, height: 28, borderRadius: 6,
                        fontSize: 10, fontWeight: 700,
                        background: avatarBg(c.id), color: "oklch(0.10 0 0 / 0.7)",
                        letterSpacing: "0.02em",
                      }}
                    >
                      {initials}
                    </div>
                  </Link>
                </td>

                {/* Name + VAT */}
                <td style={{ padding: "7px 14px", borderBottom: "1px solid var(--line-soft)", maxWidth: 340 }}>
                  <Link href={`/companies/${c.id}`} className="tbl-link" style={{ fontSize: 13 }}>
                    {c.name}
                  </Link>
                  {c.vatNumber && (
                    <span className="font-mono-ndt" style={{ fontSize: 10, color: "var(--fg-faint)", marginLeft: 8 }}>
                      {c.vatNumber}
                    </span>
                  )}
                </td>

                {/* Pipeline status + last contact — the actionable column */}
                <td style={{ padding: "7px 14px", borderBottom: "1px solid var(--line-soft)", width: 200 }}>
                  <PipelineStatusBadge status={c.pipelineStatus} />
                  {!isTerminal && (
                    <span
                      className="font-mono-ndt"
                      style={{ fontSize: 10, color: FRESHNESS_COLOR[freshness], marginLeft: 8 }}
                    >
                      {relTime}
                    </span>
                  )}
                </td>

                {/* City */}
                <td style={{ padding: "7px 14px", borderBottom: "1px solid var(--line-soft)", color: "var(--fg-mute)", fontSize: 12, whiteSpace: "nowrap" }}>
                  {c.city ?? "—"}
                  {c.county && (
                    <span style={{ color: "var(--fg-faint)", marginLeft: 6, fontSize: 10 }}>{c.county}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 font-mono-ndt" style={{ fontSize: 11, color: "var(--fg-faint)" }}>
          <span>{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} / {total.toLocaleString("hu-HU")}</span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`/companies?search=${search}&page=${page - 1}&fa=${includeFA ? "1" : "0"}`}
                style={{ padding: "4px 10px", background: "var(--bg-panel)", border: "1px solid var(--line-soft)", borderRadius: 5, color: "var(--fg-soft)", fontSize: 11 }}
              >
                ← Előző
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={`/companies?search=${search}&page=${page + 1}&fa=${includeFA ? "1" : "0"}`}
                style={{ padding: "4px 10px", background: "var(--bg-panel)", border: "1px solid var(--line-soft)", borderRadius: 5, color: "var(--fg-soft)", fontSize: 11 }}
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
