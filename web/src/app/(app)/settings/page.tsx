import { db } from "@/lib/db";
import { SettingsClient } from "./SettingsClient";
import { listAppApiKeys } from "@/app/actions/app-keys";

const TENANT_ID = 1;

export default async function SettingsPage() {
  const [tenant, credentials, appKeys] = await Promise.all([
    db.tenant.findFirst({ where: { id: TENANT_ID } }),
    db.integrationCredential.findMany({ where: { tenantId: TENANT_ID } }),
    listAppApiKeys(),
  ]);

  const connectedSlugs = new Set(credentials.filter((c) => c.isActive).map((c) => c.integrationSlug));

  return (
    <SettingsClient
      tenant={tenant ? { id: tenant.id, name: tenant.name, slug: tenant.slug } : null}
      connectedIntegrations={Array.from(connectedSlugs)}
      appKeys={appKeys}
    />
  );
}
