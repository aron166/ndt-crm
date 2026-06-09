// Feature E2 part 2: resolve a campaign's audience segment to live companies.
// Thin server wrapper so the detail page (count + preview) and the CSV export
// route share ONE resolution path — same filters, same companies as /companies.

import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { parseCompanyFilters } from "@/lib/companies/filters";
import { resolveCompanyWhere } from "@/lib/companies/resolve";
import type { AudienceCompany } from "./audience";

/** The audience's saved-view filter bundle → a tenant-scoped company where. */
export async function audienceWhere(
  filters: unknown,
  tenantId: number,
): Promise<Prisma.CompanyWhereInput> {
  // SavedView.filters is a flat { key: string } param bundle (Json column).
  const parsed = parseCompanyFilters((filters ?? {}) as Record<string, string>);
  return resolveCompanyWhere(parsed, tenantId);
}

const AUDIENCE_SELECT = {
  name: true, vatNumber: true, city: true, county: true,
  website: true, pipelineStatus: true, warmth: true, teaorCode: true,
} as const;

/** Total audience size for a resolved where. */
export function countAudience(where: Prisma.CompanyWhereInput): Promise<number> {
  return db.company.count({ where });
}

/** Audience companies (ordered by name); `take` omitted = the full list (export). */
export async function listAudience(
  where: Prisma.CompanyWhereInput,
  take?: number,
): Promise<AudienceCompany[]> {
  return db.company.findMany({
    where,
    select: AUDIENCE_SELECT,
    orderBy: { name: "asc" },
    ...(take ? { take } : {}),
  });
}
