import { db } from "@/lib/db";
import { SettingsClient } from "./SettingsClient";

const TENANT_ID = 1;

export default async function SettingsPage() {
  const [tenant, credentials] = await Promise.all([
    db.tenant.findFirst({ where: { id: TENANT_ID } }),
    db.integrationCredential.findMany({ where: { tenantId: TENANT_ID } }),
  ]);

  const connectedSlugs = new Set(credentials.filter((c) => c.isActive).map((c) => c.integrationSlug));

  return (
    <SettingsClient
      tenant={tenant ? { id: tenant.id, name: tenant.name, slug: tenant.slug } : null}
      connectedIntegrations={Array.from(connectedSlugs)}
    />
  );
}
