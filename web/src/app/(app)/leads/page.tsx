import { db } from "@/lib/db";
import { serializeDates } from "@/lib/serialize";
import { LEAD_STATUSES } from "@/lib/leads/statuses";
import { LeadsKanban } from "./LeadsKanban";

const TENANT_ID = 1;

export default async function LeadsPage() {
  const leads = await db.lead.findMany({
    where: { tenantId: TENANT_ID },
    include: {
      company: { select: { id: true, name: true } },
      contact: {
        select: {
          id: true,
          phone: true,
          email: true,
          person: { select: { id: true, firstName: true, lastName: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const leadsForClient = leads.map((l) => ({
    ...l,
    estimatedValue: l.estimatedValue != null ? Number(l.estimatedValue) : null,
    customFields: (l.customFields ?? null) as Record<string, unknown> | null,
  }));

  const open = leads.filter(
    (l) => l.status !== "unqualified" && l.status !== "nurture",
  ).length;
  const fresh = leads.filter((l) => l.status === "new").length;

  return (
    <div className="mount">
      <div className="page-head">
        <div>
          <h1 className="page-title" style={{ gap: 12 }}>
            Leadek
            <span className="font-mono-ndt" style={{ fontSize: 13, color: "var(--fg-mute)", fontWeight: 400 }}>
              · {open} aktív
            </span>
            {fresh > 0 && (
              <span className="font-mono-ndt" style={{ fontSize: 12, color: "var(--indigo)", fontWeight: 500 }}>
                · {fresh} új
              </span>
            )}
          </h1>
          <p className="page-sub">
            Beérkező érdeklődések a landing oldalakról és automatizációkból.
          </p>
        </div>
      </div>

      <LeadsKanban
        statuses={LEAD_STATUSES}
        leads={serializeDates(leadsForClient) as Parameters<typeof LeadsKanban>[0]["leads"]}
      />
    </div>
  );
}
