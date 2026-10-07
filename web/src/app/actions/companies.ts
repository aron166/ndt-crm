"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { geocode } from "@/lib/integrations/google_maps";
import { audit } from "@/lib/audit";
import { normalizeAccountType, normalizeStatus } from "@/lib/import/normalize";

import { requireCrmUser } from "@/lib/actor";

const TENANT_ID = 1;

export async function createCompany(data: {
  name: string;
  vatNumber?: string;
  status?: string;
  accountType?: string;
  city?: string;
  county?: string;
  address?: string;
  zipCode?: string;
  country?: string;
  website?: string;
}) {
  const denied = await requireCrmUser(TENANT_ID);
  if (denied) return { error: denied };
  const name = data.name.trim();
  if (!name) return { error: "A cég neve kötelező" };

  const vatNumber = data.vatNumber?.trim() || null;

  const status = normalizeStatus(data.status);
  if (status === undefined) return { error: `Ismeretlen státusz: ${data.status}` };
  const accountType = normalizeAccountType(data.accountType);
  if (accountType === undefined) return { error: `Ismeretlen partner kategória: ${data.accountType}` };

  if (vatNumber) {
    const existing = await db.company.findFirst({
      where: { tenantId: TENANT_ID, vatNumber, deletedAt: null },
      select: { id: true, name: true },
    });
    if (existing) return { error: `Ez az adószám már létezik: ${existing.name}` };
  }

  const company = await db.company.create({
    data: {
      tenantId: TENANT_ID,
      name,
      vatNumber,
      status:      status ?? "active",
      accountType,
      city:        data.city?.trim()        || null,
      county:      data.county?.trim()      || null,
      address:     data.address?.trim()     || null,
      zipCode:     data.zipCode?.trim()     || null,
      country:     data.country?.trim()     || null,
      website:     data.website?.trim()     || null,
    },
  });
  await audit("company", company.id, "create", null, { name, vatNumber });

  revalidatePath("/companies");
  return { success: true, id: company.id };
}

export async function updateCompany(
  id: number,
  data: {
    name?: string;
    vatNumber?: string;
    status?: string;
    accountType?: string;
    city?: string;
    county?: string;
    address?: string;
    zipCode?: string;
    country?: string;
    website?: string;
    pipelineStatus?: string;
  }
) {
  const denied = await requireCrmUser(TENANT_ID);
  if (denied) return { error: denied };
  const company = await db.company.findFirst({
    where: { id, tenantId: TENANT_ID, deletedAt: null },
  });
  if (!company) return { error: "Cég nem található" };

  // An unchanged value passes through untouched, so a legacy non-canonical value
  // never blocks an unrelated edit (the inline editor sends every field).
  const status = data.status === undefined || data.status === company.status ? null : normalizeStatus(data.status);
  if (status === undefined) return { error: `Ismeretlen státusz: ${data.status}` };
  const accountType = data.accountType === undefined || data.accountType === company.accountType
    ? undefined : normalizeAccountType(data.accountType);
  if (accountType === undefined && data.accountType !== undefined && data.accountType !== company.accountType) {
    return { error: `Ismeretlen partner kategória: ${data.accountType}` };
  }

  const before = { name: company.name, status: company.status, accountType: company.accountType, city: company.city };

  const updated = await db.company.update({
    where: { id },
    data: {
      name:           data.name?.trim()          ?? company.name,
      vatNumber:      data.vatNumber?.trim()      ?? company.vatNumber,
      status:         status ?? company.status,
      accountType:    accountType === undefined ? company.accountType : accountType,
      city:           data.city?.trim()           ?? company.city,
      county:         data.county?.trim()         ?? company.county,
      address:        data.address?.trim()        ?? company.address,
      zipCode:        data.zipCode?.trim()        ?? company.zipCode,
      country:        data.country?.trim()        ?? company.country,
      website:        data.website?.trim()        ?? company.website,
      pipelineStatus: data.pipelineStatus?.trim() ?? company.pipelineStatus,
    },
  });
  await audit("company", id, "update", before, {
    name: updated.name, status: updated.status, accountType: updated.accountType, city: updated.city,
  });

  revalidatePath("/companies");
  revalidatePath(`/companies/${id}`);
  return { success: true };
}

export async function deleteCompany(id: number) {
  const denied = await requireCrmUser(TENANT_ID);
  if (denied) return { error: denied };
  const company = await db.company.findFirst({
    where: { id, tenantId: TENANT_ID, deletedAt: null },
    select: { name: true },
  });
  if (!company) return { error: "Cég nem található" };

  await db.company.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit("company", id, "delete", { name: company.name }, null);

  revalidatePath("/companies");
  return { success: true };
}

export async function restoreCompany(id: number) {
  const denied = await requireCrmUser(TENANT_ID);
  if (denied) return { error: denied };
  const company = await db.company.findFirst({
    where: { id, tenantId: TENANT_ID },
    select: { name: true, deletedAt: true },
  });
  if (!company) return { error: "Cég nem található" };
  if (!company.deletedAt) return { success: true };

  await db.company.update({ where: { id }, data: { deletedAt: null } });
  await audit("company", id, "update", { deletedAt: company.deletedAt }, { deletedAt: null });

  revalidatePath("/companies");
  revalidatePath(`/companies/${id}`);
  return { success: true };
}

export async function geocodeCompany(companyId: number) {
  const denied = await requireCrmUser(TENANT_ID);
  if (denied) return { error: denied };
  const company = await db.company.findFirst({
    where: { id: companyId, tenantId: TENANT_ID },
    select: { address: true, city: true, zipCode: true, county: true, country: true },
  });
  if (!company) return { error: "Cég nem található" };

  const addressParts = [company.address, company.zipCode, company.city, company.county, company.country ?? "Magyarország"];
  const addressStr = addressParts.filter(Boolean).join(", ");
  if (!addressStr.trim()) return { error: "Nincs megadott cím" };

  const result = await geocode(addressStr);
  if (!result) return { error: "Geocoding sikertelen: ellenőrizd az API kulcsot és a cím adatokat" };

  await db.company.update({
    where: { id: companyId },
    data: { lat: result.lat, lng: result.lng, geocodedAt: new Date() },
  });

  revalidatePath(`/companies/${companyId}`);
  return { success: true, lat: result.lat, lng: result.lng, formatted: result.formatted };
}
