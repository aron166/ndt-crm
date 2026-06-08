"use server";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import {
  COMPANY_ATTR_DEFS, isCompanyAttrType, type CompanyAttrType,
} from "@/lib/companies/attributes";

const TENANT_ID = 1;

/** All metadata rows (current + history) for a company, tenant-scoped. */
export async function getCompanyAttributes(companyId: number) {
  return db.companyAttribute.findMany({
    where: { tenantId: TENANT_ID, companyId },
    orderBy: [{ attrType: "asc" }, { isPrimary: "desc" }, { validFrom: "desc" }],
  });
}

/** Build the denormalized Company column update for a primary value change. */
function denormUpdate(def: (typeof COMPANY_ATTR_DEFS)[CompanyAttrType], value: string, label: string | null): Prisma.CompanyUpdateInput {
  const data: Record<string, string | null> = { [def.primaryValueColumn]: value };
  if (def.primaryLabelColumn) data[def.primaryLabelColumn] = label;
  return data as Prisma.CompanyUpdateInput;
}

/**
 * Set the PRIMARY current value of an attribute — history-preserving. The old
 * primary is end-dated (moved to history, NOT overwritten); a new is_primary
 * current row is inserted; the denormalized Company column is updated. One
 * transaction, so the table + column never disagree. (decisions.md historical-
 * attribute pattern.)
 */
export async function setPrimaryCompanyAttribute(
  companyId: number, attrType: string, value: string, label?: string,
) {
  if (!isCompanyAttrType(attrType)) return { error: "Ismeretlen attribútum típus" };
  const v = value.trim();
  if (!v) return { error: "Az érték kötelező" };
  const lbl = label?.trim() || null;
  const def = COMPANY_ATTR_DEFS[attrType];

  const company = await db.company.findFirst({
    where: { id: companyId, tenantId: TENANT_ID, deletedAt: null },
    select: { id: true },
  });
  if (!company) return { error: "Cég nem található" };

  const currentPrimary = await db.companyAttribute.findFirst({
    where: { tenantId: TENANT_ID, companyId, attrType, isPrimary: true, validTo: null },
  });

  // No-op if the primary value is unchanged (allow a label correction).
  if (currentPrimary && currentPrimary.value === v) {
    if (currentPrimary.label !== lbl) {
      await db.companyAttribute.update({ where: { id: currentPrimary.id }, data: { label: lbl } });
      await db.company.update({ where: { id: companyId }, data: denormUpdate(def, v, lbl) });
    }
    revalidatePath(`/companies/${companyId}`);
    return { success: true };
  }

  const now = new Date();
  await db.$transaction(async (tx) => {
    if (currentPrimary) {
      await tx.companyAttribute.update({
        where: { id: currentPrimary.id },
        data: { validTo: now, isPrimary: false },
      });
    }
    await tx.companyAttribute.create({
      data: { tenantId: TENANT_ID, companyId, attrType, value: v, label: lbl, source: "manual", isPrimary: true },
    });
    await tx.company.update({ where: { id: companyId }, data: denormUpdate(def, v, lbl) });
  });

  await audit("company", companyId, "update",
    { [attrType]: currentPrimary?.value ?? null },
    { [attrType]: v },
  );
  revalidatePath(`/companies/${companyId}`);
  return { success: true };
}

/**
 * Add a SECONDARY current value (multi-value types only, e.g. a non-main TEÁOR).
 * Doesn't touch the primary or the denormalized column.
 */
export async function addSecondaryCompanyAttribute(
  companyId: number, attrType: string, value: string, label?: string,
) {
  if (!isCompanyAttrType(attrType)) return { error: "Ismeretlen attribútum típus" };
  const def = COMPANY_ATTR_DEFS[attrType];
  if (!def.multi) return { error: "Ehhez a típushoz csak egy érték tartozhat" };
  const v = value.trim();
  if (!v) return { error: "Az érték kötelező" };

  const company = await db.company.findFirst({
    where: { id: companyId, tenantId: TENANT_ID, deletedAt: null },
    select: { id: true },
  });
  if (!company) return { error: "Cég nem található" };

  const dup = await db.companyAttribute.findFirst({
    where: { tenantId: TENANT_ID, companyId, attrType, value: v, validTo: null },
  });
  if (dup) return { error: "Ez az érték már szerepel" };

  const created = await db.companyAttribute.create({
    data: { tenantId: TENANT_ID, companyId, attrType, value: v, label: label?.trim() || null, source: "manual", isPrimary: false },
  });
  await audit("company", companyId, "update", null, { [`${attrType}_secondary_added`]: v });
  revalidatePath(`/companies/${companyId}`);
  return { success: true, id: created.id };
}

/**
 * End-date a current NON-primary value (kept in history). A primary can't be
 * ended directly — change it via setPrimaryCompanyAttribute so a type is never
 * left without a current primary.
 */
export async function endCompanyAttribute(attrId: number) {
  const attr = await db.companyAttribute.findFirst({
    where: { id: attrId, tenantId: TENANT_ID, validTo: null },
  });
  if (!attr) return { error: "Attribútum nem található vagy már lezárt" };
  if (attr.isPrimary) return { error: "Az elsődleges értéket módosítással lehet lecserélni, nem lezárni" };

  await db.companyAttribute.update({ where: { id: attr.id }, data: { validTo: new Date() } });
  await audit("company", attr.companyId, "update", { [`${attr.attrType}_secondary`]: attr.value }, null);
  revalidatePath(`/companies/${attr.companyId}`);
  return { success: true };
}
