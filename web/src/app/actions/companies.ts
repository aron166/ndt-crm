"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { geocode } from "@/lib/integrations/google_maps";

const TENANT_ID = 1;

export async function geocodeCompany(companyId: number) {
  const company = await db.company.findFirst({
    where: { id: companyId, tenantId: TENANT_ID },
    select: { address: true, city: true, zipCode: true, county: true, country: true },
  });
  if (!company) return { error: "Cég nem található" };

  const addressParts = [company.address, company.zipCode, company.city, company.county, company.country ?? "Magyarország"];
  const addressStr = addressParts.filter(Boolean).join(", ");
  if (!addressStr.trim()) return { error: "Nincs megadott cím" };

  const result = await geocode(addressStr);
  if (!result) return { error: "Geocoding sikertelen — ellenőrizd az API kulcsot és a cím adatokat" };

  await db.company.update({
    where: { id: companyId },
    data: { lat: result.lat, lng: result.lng, geocodedAt: new Date() },
  });

  revalidatePath(`/companies/${companyId}`);
  return { success: true, lat: result.lat, lng: result.lng, formatted: result.formatted };
}
