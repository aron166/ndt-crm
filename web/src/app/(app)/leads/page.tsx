import { db } from "@/lib/db";
import Link from "next/link";
import { serializeDates } from "@/lib/serialize";
import { getLeadStatuses } from "@/lib/leads/queries";
import { LeadsKanban } from "./LeadsKanban";
import { Settings2 } from "lucide-react";
import { fullName, formatRelativeTime } from "@/lib/utils";
import { getLeadExtras } from "@/lib/leads/board";
import { LEAD_OUTCOME_LABEL, callOutcomeLabel, type LeadOutcome } from "@/lib/leads/outcomes";

const TENANT_ID = 1;
const PAGE_SIZE = 30;
// ponytail: per-column cap (newest first) + "N / total" badge — a kanban has no
// natural page; add per-column "load more" when a column actually exceeds this.
const COLUMN_LIMIT = 50;

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; page?: string }>;
}) {
  const { view, page: rawPage } = await searchParams;
  const showConverted = view === "closed" || view === "converted";
  const parsedPage = Number.parseInt(rawPage ?? "1", 10);
  const page = Number.isFinite(parsedPage) ? Math.max(1, parsedPage) : 1;

  // Counts power the toggle. Won (= converted to a deal) and lost leads leave
  // the active board — the "Lezárt" list keeps them for history.
  const CLOSED_WHERE = { tenantId: TENANT_ID, OR: [{ outcome: { not: "open" } }, { convertedDealId: { not: null } }] };
  const [activeCount, convertedCount] = await Promise.all([
    db.lead.count({ where: { tenantId: TENANT_ID, convertedDealId: null, outcome: "open" } }),
    db.lead.count({ where: CLOSED_WHERE }),
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
        href="/leads?view=closed"
        className="rounded-full font-mono-ndt"
        style={{
          height: 26, padding: "0 12px", fontSize: 11, lineHeight: "26px",
          background: showConverted ? "var(--mint-soft)" : "var(--bg-panel)",
          color: showConverted ? "var(--mint)" : "var(--fg-mute)",
          border: `1px solid ${showConverted ? "oklch(0.80 0.13 165 / 0.35)" : "var(--line-soft)"}`,
        }}
      >
        Lezárt · {convertedCount}
      </Link>
    </div>
  );

  if (showConverted) {
    const converted = await db.lead.findMany({
      where: CLOSED_WHERE,
      include: {
        company: { select: { id: true, name: true } },
        contact: { select: { person: { select: { firstName: true, lastName: true } } } },
      },
      orderBy: [{ closedAt: { sort: "desc", nulls: "last" } }, { convertedAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    });
    const totalPages = Math.ceil(convertedCount / PAGE_SIZE);
    const pageHref = (p: number) => `/leads?view=closed&page=${p}`;

    return (
      <div className="mount">
        <div className="page-head">
          <div>
            <h1 className="page-title">Leadek</h1>
            <p className="page-sub">Nyert (deallé alakított) és vesztett leadek.</p>
          </div>
          <div className="page-actions">{Toggle}</div>
        </div>

        <div className="panel">
          {converted.length === 0 ? (
            <div className="panel-pad" style={{ fontSize: 13, color: "var(--fg-mute)" }}>
              Még nincs lezárt lead.
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
                      {formatRelativeTime(l.closedAt ?? l.convertedAt)}
                    </span>
                    {l.convertedDealId ? (
                      <Link href="/deals" className="font-mono-ndt" style={{ color: "var(--mint)", fontSize: 12, width: 150 }}>
                        Nyert → Deal #{l.convertedDealId}
                      </Link>
                    ) : (
                      <span className="font-mono-ndt truncate" style={{ color: "var(--coral)", fontSize: 12, width: 150 }}>
                        {LEAD_OUTCOME_LABEL[l.outcome as LeadOutcome] ?? l.outcome}
                        {l.lostReason ? ` · ${callOutcomeLabel(l.lostReason)}` : ""}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pagination — same pattern as /companies */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 font-mono-ndt" style={{ fontSize: 11, color: "var(--fg-faint)" }}>
            <span>{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, convertedCount)} / {convertedCount.toLocaleString("hu-HU")}</span>
            <div className="flex gap-2">
              {page > 1 && (
                <Link
                  href={pageHref(page - 1)}
                  style={{ padding: "4px 10px", background: "var(--bg-panel)", border: "1px solid var(--line-soft)", borderRadius: 5, color: "var(--fg-soft)", fontSize: 11 }}
                >
                  ← Előző
                </Link>
              )}
              {page < totalPages && (
                <Link
                  href={pageHref(page + 1)}
                  style={{ padding: "4px 10px", background: "var(--bg-panel)", border: "1px solid var(--line-soft)", borderRadius: 5, color: "var(--fg-soft)", fontSize: 11 }}
                >
                  Következő →
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  const statuses = await getLeadStatuses(TENANT_ID);
  const initialKey = statuses.find((s) => s.isInitial)?.key ?? "new";
  const ACTIVE = { tenantId: TENANT_ID, convertedDealId: null, outcome: "open" } as const;
  const knownKeys = statuses.map((s) => s.key);
  // A lead whose status was deleted at /leads/setup has no column — it lands in
  // the entry column instead of vanishing from the board (which would make the
  // "Aktív · N" count disagree with the sum of the columns).
  const colWhere = (key: string) =>
    key === initialKey
      ? { ...ACTIVE, OR: [{ status: key }, { status: null }, { status: { notIn: knownKeys } }] }
      : { ...ACTIVE, status: key };

  // One bounded query per column (newest first) + a count per column for the
  // "shown / total" badge. Never an unbounded findMany.
  const perColumn = await Promise.all(
    statuses.map(async (st) => {
      const [rows, total] = await Promise.all([
        db.lead.findMany({
          where: colWhere(st.key),
          include: {
            company: { select: { id: true, name: true } },
            contact: {
              select: {
                id: true, phone: true, email: true,
                person: { select: { id: true, firstName: true, lastName: true, phone: true } },
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: COLUMN_LIMIT,
        }),
        db.lead.count({ where: colWhere(st.key) }),
      ]);
      return { key: st.key, rows, total };
    }),
  );
  const leads = perColumn.flatMap((c) => c.rows);
  const columnTotals = Object.fromEntries(perColumn.map((c) => [c.key, c.total]));
  const extras = await getLeadExtras(
    TENANT_ID,
    leads.map((l) => ({ id: l.id, companyId: l.companyId, personId: l.contact?.person?.id ?? null, createdAt: l.createdAt })),
  );

  const leadsForClient = leads.map((l) => ({
    ...l,
    // Same normalization as colWhere, so the client renders the card in the
    // column the server counted it in.
    status: l.status && knownKeys.includes(l.status) ? l.status : initialKey,
    estimatedValue: l.estimatedValue != null ? Number(l.estimatedValue) : null,
    customFields: (l.customFields ?? null) as Record<string, unknown> | null,
    lastContactAt: extras.get(l.id)?.lastContactAt ?? null,
    callbackDueAt: extras.get(l.id)?.callbackDueAt ?? null,
  }));
  const fresh = columnTotals[initialKey] ?? 0;

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
        <div className="page-actions" style={{ gap: 8 }}>
          {Toggle}
          <Link href="/leads/setup" className="btn sm" style={{ gap: 6 }}>
            <Settings2 style={{ width: 13, height: 13 }} />
            Státuszok
          </Link>
        </div>
      </div>

      <LeadsKanban
        statuses={statuses}
        leads={serializeDates(leadsForClient) as Parameters<typeof LeadsKanban>[0]["leads"]}
        columnTotals={columnTotals}
        columnLimit={COLUMN_LIMIT}
      />
    </div>
  );
}
