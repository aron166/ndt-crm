import { db } from "@/lib/db";
import Link from "next/link";
import { PipelineStatusBadge } from "@/components/PipelineStatusBadge";
import { formatRelativeTime, contactFreshness } from "@/lib/utils";
import { CompaniesSearch } from "./CompaniesSearch";
import { CompanyFilterBar, type CompanyFacets } from "./CompanyFilterBar";
import { CompanyActiveFilters, type ActiveChip } from "./CompanyActiveFilters";
import { CreateCompanyButton } from "@/components/CreateCompanyButton";
import { TagFilter } from "@/components/tags/TagFilter";
import { SavedViewsDropdown } from "@/components/SavedViewsDropdown";
import { getSavedViews } from "@/app/actions/saved-views";
import { RunEnrichmentButton } from "./RunEnrichmentButton";
import { COMPANY_ATTR_DEFS } from "@/lib/companies/attributes";
import {
  parseCompanyFilters, serializeCompanyFilters, type CompanyFilters,
} from "@/lib/companies/filters";
import { resolveCompanyWhere } from "@/lib/companies/resolve";

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

const PIPELINE_LABELS: Record<string, string> = {
  "0": "KUKA", "1": "Nem hívtuk", "2": "Nem válasz",
  "3": "Érdekli", "4": "Nem kell", "5": "Kéri",
  "6": "Függőben", "7": "Elveszett", "8": "Nyert",
};

/** Fixed-enum facets come from config; free-value facets (industry/teaor/county)
 * are the distinct values actually present in the tenant's data. */
async function loadFacets(): Promise<CompanyFacets> {
  const base = { tenantId: TENANT_ID, deletedAt: null };
  const [industries, teaors, counties] = await Promise.all([
    db.company.findMany({
      where: { ...base, industryCode: { not: null } },
      distinct: ["industryCode"],
      select: { industryCode: true, industryEn: true },
      orderBy: { industryCode: "asc" },
    }),
    // TEÁOR facets from company_attributes — the SAME source the resolver filters
    // on — so secondary-only current TEÁOR codes are selectable, not just primaries.
    db.companyAttribute.findMany({
      where: { tenantId: TENANT_ID, attrType: "teaor", validTo: null },
      distinct: ["value"],
      select: { value: true, label: true },
      orderBy: { value: "asc" },
      take: 300,
    }),
    db.company.findMany({
      where: { ...base, county: { not: null } },
      distinct: ["county"],
      select: { county: true },
      orderBy: { county: "asc" },
    }),
  ]);

  const opt = (type: keyof typeof COMPANY_ATTR_DEFS) =>
    (COMPANY_ATTR_DEFS[type].options ?? []).map((o) => ({ value: o.value, label: o.label }));

  return {
    industry: industries
      .filter((r) => r.industryCode)
      .map((r) => ({ value: r.industryCode!, label: r.industryEn?.trim() || r.industryCode! })),
    teaor: teaors
      .filter((r) => r.value)
      .map((r) => ({
        value: r.value,
        label: r.label?.trim() ? `${r.value} · ${r.label}` : r.value,
      })),
    county: counties
      .filter((r) => r.county)
      .map((r) => ({ value: r.county!, label: r.county! })),
    warmth: opt("warmth"),
    accountType: opt("account_type"),
    status: opt("status"),
    pipelineStatus: Object.entries(PIPELINE_LABELS).map(([value, label]) => ({ value, label })),
  };
}

/** Build the removable chip list for the active-filters row, with human labels. */
function buildActiveChips(f: CompanyFilters, facets: CompanyFacets): ActiveChip[] {
  const chips: ActiveChip[] = [];
  const labelFrom = (opts: { value: string; label: string }[], v: string) =>
    opts.find((o) => o.value === v)?.label ?? v;

  if (f.search) chips.push({ param: "search", value: undefined, label: `„${f.search}”` });

  const groups: [keyof CompanyFilters, string, { value: string; label: string }[]][] = [
    ["industry", "industry", facets.industry],
    ["teaor", "teaor", facets.teaor],
    ["county", "county", facets.county],
    ["warmth", "warmth", facets.warmth],
    ["accountType", "accountType", facets.accountType],
    ["status", "status", facets.status],
    ["pipelineStatus", "pipeline_status", facets.pipelineStatus],
  ];
  for (const [fkey, param, opts] of groups) {
    const vals = f[fkey] as string[] | undefined;
    if (vals?.length) for (const v of vals) chips.push({ param, value: v, label: labelFrom(opts, v) });
  }

  if (f.tags?.length) for (const t of f.tags) chips.push({ param: "tag", value: t, label: `#${t}` });
  if (f.neverContacted) chips.push({ param: "never_contacted", value: undefined, label: "soha nem hívtuk" });

  return chips;
}

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawPage = Array.isArray(params.page) ? params.page[0] : params.page;
  const parsedPage = Number.parseInt(rawPage ?? "1", 10);
  const page = Number.isFinite(parsedPage) ? Math.max(1, parsedPage) : 1;
  const filters = parseCompanyFilters(params);

  const where = await resolveCompanyWhere(filters, TENANT_ID);

  const [companies, total, savedViews, facets] = await Promise.all([
    db.company.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.company.count({ where }),
    getSavedViews("company"),
    loadFacets(),
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const activeChips = buildActiveChips(filters, facets);
  const serialized = serializeCompanyFilters(filters);

  // Pagination link preserving every active filter param.
  function pageHref(p: number) {
    const sp = new URLSearchParams(serialized);
    sp.set("page", String(p));
    return `/companies?${sp.toString()}`;
  }

  return (
    <div className="mount">
      {/* Active filter chips (removable) */}
      <CompanyActiveFilters chips={activeChips} />

      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-5">
        <div className="flex items-center gap-3">
          <h1 style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em", margin: 0, color: "var(--fg)", display: "flex", alignItems: "baseline", gap: 8 }}>
            Cégek
            <span className="font-mono-ndt" style={{ fontSize: 12, color: "var(--fg-faint)", fontWeight: 400 }}>
              {total.toLocaleString("hu-HU")}
            </span>
          </h1>
          <CreateCompanyButton />
        </div>
        <div className="flex items-center gap-2">
          <CompaniesSearch search={filters.search ?? ""} includeFA={filters.includeFA ?? false} />
          <CompanyFilterBar facets={facets} />
          <TagFilter activeTagName={filters.tags?.[0]} />
          <RunEnrichmentButton companyIds={companies.map((c) => c.id)} />
          <SavedViewsDropdown
            entityType="company"
            basePath="/companies"
            currentParams={serialized}
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
                {activeChips.length > 0 && (
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
                href={pageHref(page - 1)}
                style={{ padding: "4px 10px", background: "var(--bg-panel)", border: "1px solid var(--line-soft)", borderRadius: 5, color: "var(--fg-soft)", fontSize: 11 }}
              >
                ← Előző
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={pageHref(page + 1)}
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
