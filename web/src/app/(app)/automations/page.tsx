import { db } from "@/lib/db";
import { getLeadStatuses } from "@/lib/leads/queries";
import { serializeDates } from "@/lib/serialize";
import { AutomationsClient } from "./AutomationsClient";

const TENANT_ID = 1;

export default async function AutomationsPage() {
  const [rules, leadStatuses, pipelines] = await Promise.all([
    db.automationRule.findMany({
      where: { tenantId: TENANT_ID },
      orderBy: { createdAt: "asc" },
    }),
    getLeadStatuses(TENANT_ID),
    db.pipeline.findMany({
      where: { tenantId: TENANT_ID, isArchived: false },
      orderBy: { position: "asc" },
      select: {
        name: true,
        stages: { orderBy: { position: "asc" }, select: { id: true, name: true } },
      },
    }),
  ]);

  // Flatten stages across pipelines for the stage selects (label keeps the
  // pipeline name so duplicate stage names stay distinguishable).
  const stages = pipelines.flatMap((p) =>
    p.stages.map((s) => ({ id: s.id, label: `${p.name} · ${s.name}` })),
  );

  return (
    <div className="mount">
      <AutomationsClient
        rules={serializeDates(rules)}
        leadStatuses={leadStatuses.map((s) => ({ key: s.key, label: s.label }))}
        stages={stages}
      />
    </div>
  );
}
