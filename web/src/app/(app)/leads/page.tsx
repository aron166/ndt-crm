import { db } from "@/lib/db";
import Link from "next/link";
import { serializeDates } from "@/lib/serialize";
import { LEAD_STATUSES } from "@/lib/leads/statuses";
import { LeadsKanban } from "./LeadsKanban";
import { fullName, formatRelativeTime } from "@/lib/utils";

const TENANT_ID = 1;

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  const showConverted = view === "converted";

  // Counts power the toggle. Converted leads have graduated to the deal pipeline
  // and are excluded from the active board — see lead-deal-process-tracker model.
  const [activeCount, convertedCount] = await Promise.all([
    db.lead.count({ where: { tenantId: TENANT_ID, convertedDealId: null } }),
    db.lead.count({ where: { tenantId: TENANT_ID, convertedDealId: { not: null } } }),
  ]);

  const Toggle = (
    <div className="flex items-center gap-2">
      <Link
        href="/leads"
        className="rounded-full font-mono-ndt"
        style={{
          height: 26, padding: "0 12px", fontSize: 11, lineHeight: "26px",
          background: showConverted ? "var(--bg-panel)" : "var(--indigo-soft)",
          color: showConverted ? "var(--fg-mute)" : "var(--indigo)",
          border: `1px solid ${showConverted ? "var(--line-soft)" : "var(--indigo-line)"}`,
        }}
      >
        Aktív · {activeCount}
      </Link>
      <Link
        href="/leads?view=converted"
        className="rounded-full font-mono-ndt"
        style={{
          height: 26, padding: "0 12px", fontSize: 11, lineHeight: "26px",
          background: showConverted ? "var(--mint-soft)" : "var(--bg-panel)",
          color: showConverted ? "var(--mint)" : "var(--fg-mute)",
          border: `1px solid ${showConverted ? "oklch(0.80 0.13 165 / 0.35)" : "var(--line-soft)"}`,
        }}
      >
        Konvertált · {convertedCount}
      </Link>
    </div>
  );

  if (showConverted) {
    const converted = await db.lead.findMany({
      where: { tenantId: TENANT_ID, convertedDealId: { not: null } },
      include: {
        company: { select: { id: true, name: true } },
        contact: { select: { person: { select: { firstName: true, lastName: true } } } },
      },
      orderBy: { convertedAt: "desc" },
    });

    return (
      <div className="mount">
        <div className="page-head">
          <div>
            <h1 className="page-title">Leadek</h1>
            <p className="page-sub">Deallé alakított leadek — átkerültek a deal pipeline-ba.</p>
          </div>
          <div className="page-actions">{Toggle}</div>
        </div>

        <div className="panel">
          {converted.length === 0 ? (
            <div className="panel-pad" style={{ fontSize: 13, color: "var(--fg-mute)" }}>
              Még nincs konvertált lead.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {converted.map((l) => {
                const personName = l.contact?.person
                  ? fullName(l.contact.person.firstName, l.contact.person.lastName)
                  : (l.customFields as Record<string, unknown> | null)?.contact_name as string | undefined;
                return (
                  <div
                    key={l.id}
                    className="flex items-center gap-3"
                    style={{ padding: "12px 16px", borderBottom: "1px solid var(--line-soft)", fontSize: 13 }}
                  >
                    <Link href={`/leads/${l.id}`} className="row-link" style={{ flex: 1, color: "var(--fg)" }}>
                      {l.serviceInterest || l.subject || "Érdeklődés"}
                    </Link>
                    {l.company && (
                      <Link href={`/companies/${l.company.id}`} className="row-link truncate" style={{ width: 180, color: "var(--fg-mute)" }}>
                        {l.company.name}
                      </Link>
                    )}
                    <span className="truncate" style={{ width: 150, color: "var(--fg-faint)" }}>{personName || "—"}</span>
                    <span className="font-mono-ndt" style={{ width: 90, color: "var(--fg-faint)", fontSize: 11 }}>
                      {l.convertedAt ? formatRelativeTime(l.convertedAt) : ""}
                    </span>
                    <Link href="/deals" className="font-mono-ndt" style={{ color: "var(--mint)", fontSize: 12 }}>
                      → Deal #{l.convertedDealId}
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  const leads = await db.lead.findMany({
    where: { tenantId: TENANT_ID, convertedDealId: null },
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

  const fresh = leads.filter((l) => l.status === "new").length;

  return (
    <div className="mount">
      <div className="page-head">
        <div>
          <h1 className="page-title" style={{ gap: 12 }}>
            Leadek
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
        <div className="page-actions">{Toggle}</div>
      </div>

      <LeadsKanban
        statuses={LEAD_STATUSES}
        leads={serializeDates(leadsForClient) as Parameters<typeof LeadsKanban>[0]["leads"]}
      />
    </div>
  );
}
