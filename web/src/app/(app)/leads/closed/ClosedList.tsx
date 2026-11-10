import Link from "next/link";
import { db } from "@/lib/db";
import { fullName, formatRelativeTime } from "@/lib/utils";
import { LEAD_OUTCOME_LABEL, type LeadOutcome } from "@/lib/leads/outcomes";
import { lostReasonLabel } from "@/lib/leads/lifecycle";
import s from "../queue/queue.module.css";

const PAGE_SIZE = 30;
export const CLOSED_WHERE = { tenantId: 1, OR: [{ outcome: { not: "open" } }, { convertedDealId: { not: null } }] };

export async function ClosedList({ page, total }: { page: number; total: number }) {
  const rows = await db.lead.findMany({
    where: CLOSED_WHERE,
    include: {
      company: { select: { id: true, name: true } },
      contact: { select: { person: { select: { firstName: true, lastName: true } } } },
    },
    orderBy: [{ closedAt: { sort: "desc", nulls: "last" } }, { convertedAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const pageHref = (p: number) => `/leads?view=closed&page=${p}`;

  if (total === 0) return <span className={s.muted}>Még nincs lezárt lead.</span>; // PROPOSAL copy
  return (
    <div>
      {rows.map((l) => {
        const personName = l.contact?.person
          ? fullName(l.contact.person.firstName, l.contact.person.lastName)
          : ((l.customFields as Record<string, unknown> | null)?.contact_name as string | undefined);
        return (
          <div key={l.id} className={s.row}>
            <Link href={`/leads/${l.id}`} className={s.name} style={{ flex: "1 1 220px", fontSize: 15 }}>
              {l.serviceInterest || l.subject || "Érdeklődés"}
            </Link>
            {l.company && <Link href={`/companies/${l.company.id}`} className={s.link} style={{ width: 180 }}>{l.company.name}</Link>}
            <span className={s.muted} style={{ width: 150 }}>{personName || "-"}</span>
            <span className={s.muted} style={{ width: 90 }}>{formatRelativeTime(l.closedAt ?? l.convertedAt)}</span>
            {l.convertedDealId ? (
              <Link href="/deals" className={s.link} style={{ width: 150 }}>Nyert {"->"} Deal #{l.convertedDealId}</Link>
            ) : (
              <span className={s.muted} style={{ width: 150 }}>
                {LEAD_OUTCOME_LABEL[l.outcome as LeadOutcome] ?? l.outcome}
                {l.lostReason ? `, ${lostReasonLabel(l.lostReason)}` : ""}
              </span>
            )}
          </div>
        );
      })}
      {(totalPages > 1 || page > totalPages) && (
        <div className={s.pager}>
          <span className={s.muted}>
            {rows.length === 0 ? `0 / ${total.toLocaleString("hu-HU")}` : `${(page - 1) * PAGE_SIZE + 1}-${Math.min(page * PAGE_SIZE, total)} / ${total.toLocaleString("hu-HU")}`}
          </span>
          <div style={{ display: "flex", gap: 16 }}>
            {page > totalPages && <Link href={pageHref(1)} className={s.link}>Vissza az 1. oldalra</Link>} {/* PROPOSAL copy */}
            {page > 1 && page <= totalPages && <Link href={pageHref(page - 1)} className={s.link}>Előző</Link>}
            {page < totalPages && <Link href={pageHref(page + 1)} className={s.link}>Következő</Link>}
          </div>
        </div>
      )}
    </div>
  );
}
