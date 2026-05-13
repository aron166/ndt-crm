import { db } from "@/lib/db";

const TENANT_ID = 1;

async function getApiKey(): Promise<string | null> {
  const cred = await db.integrationCredential.findUnique({
    where: { tenantId_integrationSlug: { tenantId: TENANT_ID, integrationSlug: "google_maps" } },
  });
  if (!cred?.isActive) return null;
  return (cred.credentials as Record<string, string>).apiKey ?? null;
}

export async function isConnected(): Promise<boolean> {
  return (await getApiKey()) !== null;
}

interface GeocodeResult {
  lat: number;
  lng: number;
  formatted: string;
}

export async function geocode(address: string): Promise<GeocodeResult | null> {
  const apiKey = await getApiKey();
  if (!apiKey || !address.trim()) return null;

  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) return null;

  const data = await res.json();
  if (data.status !== "OK" || !data.results?.[0]) return null;

  const result = data.results[0];
  return {
    lat: result.geometry.location.lat,
    lng: result.geometry.location.lng,
    formatted: result.formatted_address,
  };
}
