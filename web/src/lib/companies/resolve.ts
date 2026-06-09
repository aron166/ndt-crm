// Feature E2: server-side resolution of a CompanyFilters segment into a final,
// tenant-scoped Prisma where. The ONE place tags get turned into company ids and
// the scalar where is merged with tenant scope. Both /companies and the marketing
// campaign audience call this, so a saved segment means the same set everywhere.
//
// Server-only (imports db). The pure parse/serialize/scalar-where live in
// ./filters and stay client-safe + unit-tested.

import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { buildScalarCompanyWhere, type CompanyFilters } from "./filters";

/**
 * Resolve tag NAMES (OR-within) → the set of company ids carrying ANY of them.
 * Returns [] when names are given but none match, so the caller filters to empty
 * (a tag filter that matches nothing must NOT silently match everything).
 */
async function resolveTagCompanyIds(tenantId: number, names: string[]): Promise<number[]> {
  const tags = await db.tag.findMany({
    where: { tenantId, name: { in: names, mode: "insensitive" } },
    include: { taggings: { where: { taggableType: "company" }, select: { taggableId: true } } },
  });
  const ids = new Set<number>();
  for (const t of tags) for (const tg of t.taggings) ids.add(tg.taggableId);
  return [...ids];
}

/**
 * Build the complete, tenant-scoped `where` for a company segment. AND-composes:
 * tenant scope + not-deleted + the scalar/relation filters + (if tags requested)
 * the resolved id set.
 */
export async function resolveCompanyWhere(
  filters: CompanyFilters,
  tenantId: number,
): Promise<Prisma.CompanyWhereInput> {
  const where: Prisma.CompanyWhereInput = {
    tenantId,
    deletedAt: null,
    ...buildScalarCompanyWhere(filters),
  };

  if (filters.tags?.length) {
    const ids = await resolveTagCompanyIds(tenantId, filters.tags);
    where.id = { in: ids };
  }

  return where;
}
