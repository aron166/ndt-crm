import { db } from "@/lib/db";
import Link from "next/link";
import { serializeDates } from "@/lib/serialize";
import { getLeadStatuses, getScriptVariants } from "@/lib/leads/queries";
import { LeadsKanban } from "./LeadsKanban";
import { Settings2 } from "lucide-react";
import { getLeadExtras } from "@/lib/leads/board";
import { firstContactByLead } from "@/lib/leads/first-contact-query";
import { minutesToFirstContact, tierAFlag } from "@/lib/leads/first-contact";
import { MAIN_STAGES, SIDE_STAGES } from "@/lib/leads/lifecycle";
import type { LeadStatusDef } from "@/lib/leads/statuses";
import { TIERS, TIER_LABEL, isTier } from "@/lib/leads/tier";
import { getActor } from "@/lib/actor";
import { LeadsHeader } from "./queue/LeadsHeader";
import { CallQueue } from "./queue/CallQueue";
import { TripsAside } from "./queue/TripsAside";
import { groupQueue, getQueueRows, getQueueTotal, getFooterCounts } from "./queue/queue-data";
import { ClosedList, CLOSED_WHERE } from "./closed/ClosedList";
import qcss from "./queue/queue.module.css";

const TENANT_ID = 1;
// ponytail: per-column cap (newest first) + "N / total" badge: a kanban has no
// natural page; add per-column "load more" when a column actually exceeds this.
const COLUMN_LIMIT = 50;

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; page?: string; tier?: string; owner?: string }>;
}) {
  const { view, page: rawPage, tier: rawTier, owner: rawOwner } = await searchParams;
  const showConverted = view === "closed" || view === "converted";
  // No view = the leads board (Aron 2026-11-10: a lead is not a call); the call queue is one view, ?view=queue.
  const isQueue = !showConverted && view === "queue";
  const sideView = view === "recall" || view === "lost" ? view : null;
  const parsedPage = Number.parseInt(rawPage ?? "1", 10);
  const page = Number.isFinite(parsedPage) ? Math.max(1, parsedPage) : 1;
  // Tier filter applies only to the active (kanban) view: closed list ignores it.
  const tier = isTier(rawTier) ? rawTier : null;

  // Counts power the toggle. Won (= converted to a deal) and lost leads leave
  // the active board: the "Lezárt" list keeps them for history.
  const [actor, users, convertedCount] = await Promise.all([
    getActor(TENANT_ID),
    db.user.findMany({ where: { tenantId: TENANT_ID, email: { not: { endsWith: "@system" } } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.lead.count({ where: CLOSED_WHERE }),
  ]);

  const explicitOwner = rawOwner === "all" || users.some((u) => String(u.id) === rawOwner);
  // No owner chosen and the signed-in user owns no open lead: show everyone's queue, not an
  // empty page (Aron could not find his leads in prod, 2026-11-10). The owner filter shows "Mindenki".
  const myTotal = !explicitOwner && rawOwner !== "me" && actor.userId != null ? await getQueueTotal(actor.userId) : null;
  const ownsNone = !explicitOwner && rawOwner !== "me" && (actor.userId == null || myTotal === 0);
  const ownerParam = explicitOwner ? rawOwner! : ownsNone ? "all" : "me";
  // An explicit ?owner=me without a resolved user sees nothing (-1), never everyone.
  const assignedToId = ownerParam === "all" ? null : ownerParam === "me" ? (actor.userId ?? -1) : Number(ownerParam);
  // Board main columns and the queue are the same set (open, recall and lost off), so one count serves both tabs
  // and follows the owner filter. Recall leads sit off the main columns and stay out of it.
  const openTotal = ownerParam === "me" && myTotal != null ? myTotal : await getQueueTotal(assignedToId);
  const queueTotalOther = openTotal;

  const header = (
    props: Pick<React.ComponentProps<typeof LeadsHeader>, "view" | "title" | "help" | "owner" | "actions"> & { queueCount?: number },
  ) => <LeadsHeader {...props} queueCount={props.queueCount ?? queueTotalOther} openCount={openTotal} ownerHref={ownerHref} closedCount={convertedCount} />;
  // Owner links keep the view and, on the board, the tier and side filters.
  const ownerHref = (key: string) => {
    const q = new URLSearchParams();
    if (isQueue) q.set("view", "queue");
    else if (sideView) q.set("view", sideView);
    if (!isQueue && tier) q.set("tier", tier);
    q.set("owner", key);
    return `/leads?${q.toString()}`;
  };
  // PROPOSAL copy
  const ownerHelp = ownsNone ? "Nincs hozzád rendelt nyitott lead, ezért mindenki leadjei látszanak." : undefined;

  if (showConverted) {
    return (
      <div className="mount">
        {header({ view: "closed", title: "Lezárt leadek" /* PROPOSAL copy */ })}
        <ClosedList page={page} total={convertedCount} />
      </div>
    );
  }

  if (isQueue) {
    const now = new Date();
    const [statuses, rows, counts, queueTotal] = await Promise.all([
      getLeadStatuses(TENANT_ID), getQueueRows(assignedToId), getFooterCounts(), openTotal,
    ]);
    // Heading counts come from the loaded rows (at most 200, most urgent first), so
    // past the cap they undercount; the list footer says so.
    const groups = groupQueue(rows, now);
    const n = (k: string) => groups.find((g) => g.key === k)?.rows.length ?? 0;
    const late = n("overdue");
    const today = n("today");
    // PROPOSAL copy
    const title = late + today === 0 ? "Ma nincs esedékes hívás" : `${late} késésben, ${today} ma esedékes`;
    return (
      <div className="mount">
        {header({
          view: "queue", title, queueCount: queueTotal,
          help: ownerHelp ?? "Felülről lefelé haladj. A Hívás gomb tárcsáz és megnyitja a lead lapját.",
          owner: { current: ownerParam, users },
        })}
        <div className={qcss.split}>
          <CallQueue
            groups={groups} statuses={statuses} now={now} recall={counts.recall} lost={counts.lost}
            owner={ownerParam} ownerName={users.find((u) => String(u.id) === ownerParam)?.name ?? null}
            total={queueTotal} loaded={rows.length}
          />
          <TripsAside now={now} />
        </div>
      </div>
    );
  }

  const [statuses, scriptVariants] = await Promise.all([
    getLeadStatuses(TENANT_ID),
    getScriptVariants(TENANT_ID),
  ]);
  // Fall back to the first configured column, never to a key with no column:
  // a tenant can end up with zero isInitial statuses (unchecking it at /leads/setup
  // clears the flag without electing a replacement), and orphaned leads must still land.
  const allStatuses = statuses;
  const mainStatuses = allStatuses.filter((s) => (MAIN_STAGES as readonly string[]).includes(s.key));
  const sideDef: LeadStatusDef | null = sideView
    ? allStatuses.find((s) => s.key === sideView) ?? {
        key: sideView, label: sideView === "recall" ? "Visszahívás" : "Elveszett", color: "#8b8b9a", position: 99, // design-allow: user data colour (stage fallback)
        isInitial: false, isTerminal: sideView === "lost", isCommitment: false, description: null,
      } // PROPOSAL copy
    : null;
  const boardStatuses = sideDef ? [sideDef] : mainStatuses;
  const initialKey = mainStatuses.find((s) => s.isInitial)?.key ?? mainStatuses[0]?.key ?? "new";
  const ACTIVE = {
    tenantId: TENANT_ID, convertedDealId: null,
    outcome: sideView === "lost" ? "lost" : "open",
    ...(tier ? { tier } : {}),
    ...(assignedToId != null ? { assignedToId } : {}),
  };
  const knownKeys = allStatuses.map((s) => s.key);
  // A lead whose status was deleted at /leads/setup has no column: it lands in
  // the entry column instead of vanishing from the board (which would make the
  // "Aktív · N" count disagree with the sum of the columns).
  const colWhere = (key: string) =>
    sideView === "lost" ? ACTIVE
    : sideView ? { ...ACTIVE, status: key }
    : key === initialKey
      ? { ...ACTIVE, OR: [{ status: key }, { status: null }, { status: { notIn: knownKeys } }] }
      : { ...ACTIVE, status: key };

  // One bounded query per column (newest first). Never an unbounded findMany.
  // ponytail: under the cap, rows.length IS the total: the COUNT only fires for a
  // capped column, and pays a serial round trip when it does. Fine at ~2ms (fra1);
  // if several columns ever sit at the cap, pair it back into the findMany's Promise.all.
  const perColumn = await Promise.all(
    boardStatuses.map(async (st) => {
      const rows = await db.lead.findMany({
        where: colWhere(st.key),
        include: {
          company: { select: { id: true, name: true } },
          assignedTo: { select: { name: true } },
          contact: {
            select: {
              id: true, phone: true, email: true,
              person: { select: { id: true, firstName: true, lastName: true, phone: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: COLUMN_LIMIT,
      });
      const total =
        rows.length < COLUMN_LIMIT ? rows.length : await db.lead.count({ where: colWhere(st.key) });
      return { key: st.key, rows, total };
    }),
  );
  const leads = perColumn.flatMap((c) => c.rows);
  const columnTotals = Object.fromEntries(perColumn.map((c) => [c.key, c.total]));
  const leadRefs = leads.map((l) => ({ id: l.id, companyId: l.companyId, personId: l.contact?.person?.id ?? null, createdAt: l.createdAt }));
  const [extras, firstContacts] = await Promise.all([
    getLeadExtras(TENANT_ID, leadRefs),
    firstContactByLead(TENANT_ID, leadRefs),
  ]);
  const now = new Date();

  const leadsForClient = leads.map((l) => ({
    ...l,
    firstContactMin: minutesToFirstContact(l.createdAt, firstContacts.get(l.id) ?? null),
    tierFlag: tierAFlag(l.tier, l.createdAt, firstContacts.get(l.id) ?? null, now),
    // Same normalization as colWhere, so the client renders the card in the
    // column the server counted it in.
    status: sideView ?? (l.status && knownKeys.includes(l.status) ? l.status : initialKey),
    estimatedValue: l.estimatedValue != null ? Number(l.estimatedValue) : null,
    owner: l.assignedTo?.name ?? null,
    customFields: (l.customFields ?? null) as Record<string, unknown> | null,
    lastContactAt: extras.get(l.id)?.lastContactAt ?? null,
    callbackDueAt: extras.get(l.id)?.callbackDueAt ?? null,
  }));

  const tierPill = (href: string, active: boolean, label: string) => (
    <Link
      key={href}
      href={href}
      className="rounded-full inline-flex items-center touch44"
      style={{
        whiteSpace: "nowrap", padding: "0 12px", fontSize: 12, lineHeight: "26px",
        background: active ? "var(--ui-accent-surface)" : "var(--ui-surface)",
        color: active ? "var(--ui-text)" : "var(--ui-text-muted)",
        border: `1px solid ${active ? "var(--ui-border-strong)" : "var(--ui-border)"}`,
      }}
    >
      {label}
    </Link>
  );

  // Seed from the current params, touch only our key (same as the tier pills).
  const hrefWith = (key: "tier" | "view", value: string | null) => {
    const q = new URLSearchParams();
    if (tier) q.set("tier", tier);
    q.set("view", sideView ?? "board");
    if (ownerParam !== "me") q.set("owner", ownerParam);
    if (value) q.set(key, value); else q.delete(key);
    if (key === "view" && !value) q.set("view", "board");
    return `/leads?${q.toString()}`;
  };

  const SideFilter = (
    <div className="flex flex-wrap items-center gap-2">
      {/* PROPOSAL copy */}
      {tierPill(hrefWith("view", sideView === "recall" ? null : "recall"), sideView === "recall", "Visszahívás")}
      {tierPill(hrefWith("view", sideView === "lost" ? null : "lost"), sideView === "lost", "Elveszett")}
    </div>
  );

  const TierFilter = (
    <div className="flex flex-wrap items-center gap-2">
      {tierPill(hrefWith("tier", null), tier === null, "Mind")}
      {TIERS.map((t) => tierPill(hrefWith("tier", t), tier === t, `${t} · ${TIER_LABEL[t]}`))}
    </div>
  );

  return (
    <div className="mount">
      {header({
        view: "board",
        title: "Leadek", // PROPOSAL copy
        help: ownerHelp,
        owner: { current: ownerParam, users },
        actions: (
          <div className="flex flex-wrap items-center gap-2">
            {TierFilter}
            {SideFilter}
            <Link href="/leads/setup" className="btn sm" style={{ gap: 6 }}>
              <Settings2 style={{ width: 13, height: 13 }} />
              Státuszok
            </Link>
          </div>
        ),
      })}

      <LeadsKanban
        statuses={boardStatuses}
        sideView={sideView}
        leads={serializeDates(leadsForClient) as Parameters<typeof LeadsKanban>[0]["leads"]}
        columnTotals={columnTotals}
        columnLimit={COLUMN_LIMIT}
        scriptVariants={scriptVariants}
      />
    </div>
  );
}
