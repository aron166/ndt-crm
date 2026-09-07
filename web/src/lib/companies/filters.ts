// Feature E2: the company SEGMENT filter engine. ONE definition of how a set of
// filter criteria becomes (a) URL params, (b) a Prisma where. Both the /companies
// filter bar AND the marketing campaign audience resolver consume this — so a
// saved segment always resolves to the exact same set of companies wherever it's
// read. Pure (no db, type-only Prisma import) → client-safe + unit-testable.
//
// Composition rule (locked with Áron 2026-06-08): AND **across** attribute types,
// OR **within** one type. "Warm companies in Pest OR Fejér megye, TEÁOR 2511 OR
// 2512" = (warmth=warm) AND (county in {Pest,Fejér}) AND (teaor in {2511,2512}).
//
// Multi-value attrs (TEÁOR) match ANY CURRENT value via the company_attributes
// relation, so a company is included on a SECONDARY TEÁOR too — not just its
// denormalized primary. Single-value attrs filter the fast denormalized column.

import type { Prisma } from "@prisma/client";

/** A parsed, typed segment definition. Arrays = OR-within; empty/undefined = inactive. */
export interface CompanyFilters {
  search?: string;
  /** Single-value attrs → match the denormalized primary column (value IN [...]). */
  industry?: string[];
  county?: string[];
  status?: string[];
  accountType?: string[];
  warmth?: string[];
  pipelineStatus?: string[];
  /** Multi-value attr → match ANY current company_attributes row (primary OR secondary). */
  teaor?: string[];
  /** Tag NAMES (OR-within). Resolved to company ids by the async resolver — not here. */
  tags?: string[];
  neverContacted?: boolean;
  includeFA?: boolean;
}

/** Every array-valued (multi-select) param key, in display order. */
export const MULTI_PARAM_KEYS = [
  "industry", "teaor", "county", "status", "accountType", "warmth", "pipelineStatus", "tags",
] as const;
export type MultiParamKey = (typeof MULTI_PARAM_KEYS)[number];

/** Values are comma-joined in a single URL param; filter values must not contain commas. */
const DELIM = ",";

function splitCsv(v: string | string[] | undefined): string[] | undefined {
  if (v === undefined) return undefined;
  const raw = Array.isArray(v) ? v.join(DELIM) : v;
  const parts = raw.split(DELIM).map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts : undefined;
}

type RawParams = Record<string, string | string[] | undefined> | URLSearchParams;

function get(sp: RawParams, key: string): string | string[] | undefined {
  if (sp instanceof URLSearchParams) {
    const all = sp.getAll(key);
    return all.length === 0 ? undefined : all.length === 1 ? all[0] : all;
  }
  return sp[key];
}

function getStr(sp: RawParams, key: string): string | undefined {
  const v = get(sp, key);
  const s = (Array.isArray(v) ? v[0] : v)?.trim();
  return s || undefined;
}

/** URL searchParams → typed filters. Tolerant of repeated OR comma-joined values. */
export function parseCompanyFilters(sp: RawParams): CompanyFilters {
  return {
    search: getStr(sp, "search"),
    industry: splitCsv(get(sp, "industry")),
    teaor: splitCsv(get(sp, "teaor")),
    county: splitCsv(get(sp, "county")),
    status: splitCsv(get(sp, "status")),
    accountType: splitCsv(get(sp, "accountType")),
    warmth: splitCsv(get(sp, "warmth")),
    pipelineStatus: splitCsv(get(sp, "pipeline_status")),
    tags: splitCsv(get(sp, "tag")),
    neverContacted: getStr(sp, "never_contacted") === "1",
    includeFA: getStr(sp, "fa") === "1",
  };
}

/** Typed filters → flat string param record (for links + SavedView round-trip). */
export function serializeCompanyFilters(f: CompanyFilters): Record<string, string> {
  const out: Record<string, string> = {};
  if (f.search) out.search = f.search;
  if (f.industry?.length) out.industry = f.industry.join(DELIM);
  if (f.teaor?.length) out.teaor = f.teaor.join(DELIM);
  if (f.county?.length) out.county = f.county.join(DELIM);
  if (f.status?.length) out.status = f.status.join(DELIM);
  if (f.accountType?.length) out.accountType = f.accountType.join(DELIM);
  if (f.warmth?.length) out.warmth = f.warmth.join(DELIM);
  if (f.pipelineStatus?.length) out.pipeline_status = f.pipelineStatus.join(DELIM);
  if (f.tags?.length) out.tag = f.tags.join(DELIM);
  if (f.neverContacted) out.never_contacted = "1";
  if (f.includeFA) out.fa = "1";
  return out;
}

/** True if any filter beyond the default (FA hidden) view is active. */
export function hasActiveCompanyFilters(f: CompanyFilters): boolean {
  return Boolean(
    f.search ||
    f.industry?.length || f.teaor?.length || f.county?.length ||
    f.status?.length || f.accountType?.length || f.warmth?.length ||
    f.pipelineStatus?.length || f.tags?.length ||
    f.neverContacted,
  );
}

/** Count active filter groups — for a "N szűrő aktív" badge. (FA toggle excluded.) */
export function activeCompanyFilterCount(f: CompanyFilters): number {
  let n = 0;
  if (f.search) n++;
  if (f.industry?.length) n++;
  if (f.teaor?.length) n++;
  if (f.county?.length) n++;
  if (f.status?.length) n++;
  if (f.accountType?.length) n++;
  if (f.warmth?.length) n++;
  if (f.pipelineStatus?.length) n++;
  if (f.tags?.length) n++;
  if (f.neverContacted) n++;
  return n;
}

/**
 * The db-free portion of the Prisma where (everything EXCEPT tags, which need an
 * id lookup). Caller ANDs this with the tag-resolved clause + tenant scope. Each
 * present group is its own AND-ed key; multi-select values become `{ in: [...] }`
 * (OR-within). Always excludes soft-deleted; hides "F.A." unless includeFA.
 */
export function buildScalarCompanyWhere(f: CompanyFilters): Prisma.CompanyWhereInput {
  const and: Prisma.CompanyWhereInput[] = [];

  if (f.search) {
    and.push({
      OR: [
        { name: { contains: f.search, mode: "insensitive" } },
        { vatNumber: { contains: f.search, mode: "insensitive" } },
        { city: { contains: f.search, mode: "insensitive" } },
      ],
    });
  }
  if (f.industry?.length) and.push({ industryCode: { in: f.industry } });
  if (f.county?.length) and.push({ county: { in: f.county } });
  if (f.status?.length) and.push({ status: { in: f.status } });
  if (f.accountType?.length) and.push({ accountType: { in: f.accountType } });
  if (f.warmth?.length) and.push({ warmth: { in: f.warmth } });
  if (f.pipelineStatus?.length) and.push({ pipelineStatus: { in: f.pipelineStatus } });

  // Multi-value attr: match ANY CURRENT (validTo null) company_attributes row.
  if (f.teaor?.length) {
    and.push({
      attributes: { some: { attrType: "teaor", validTo: null, value: { in: f.teaor } } },
    });
  }

  if (f.neverContacted) and.push({ lastInteractionDate: null });
  if (!f.includeFA) and.push({ NOT: { name: { contains: "F.A." } } });

  return and.length ? { AND: and } : {};
}
