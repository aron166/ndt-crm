// Hungarian copy is PROPOSAL until Áron approves.
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { CATEGORY_LABEL, UI } from "@/lib/content/labels";
import { countPendingForReviewer, openDecisionsWhere } from "@/lib/content/queries";
import { reviewersFromSettings } from "@/lib/content/reviewers";
import { getPatchnotes } from "@/lib/patchnotes/github";
import { getWeeklyReport, lastDays } from "@/lib/reports/weekly";
import type { ContentCategory } from "@/lib/content/types";

/** ~2.5K tokens of CRM state per message: Groq free tier is 8K tokens/min (prompt + reply). */
export const HUB_CONTEXT_BUDGET_CHARS = 7000;

export type HubItem = {
  id: number; title: string; category: string; status: string; stage: string; version: number | null;
  openChecks: number; owedBy: string[]; ageDays: number; updatedAt: string;
  lastComment: { by: string; text: string } | null; campaign: string | null;
};
export type HubDecision = {
  checkId: number; itemId: number; question: string; forWhom: "aron" | "peter" | "either"; state: string;
  deadline: string | null; daysWaiting: number; answer: string | null;
};
export type HubData = {
  now: Date; items: HubItem[]; archivedCount: number; decisions: HubDecision[];
  mine: { itemIds: number[]; checkIds: number[] };
  /** Server-computed: the same number as the nav badge, never counted by the model. */
  pendingCount: number;
  patch: { merged7: number; backlog: number; decisionAron: number } | null;
  weekly: { leads: number; calls: number; demos: number } | null;
  truncatedQuery: boolean;
};

/** Board order (BoardClient COLUMNS); Kampányban is a derived column, not a status. */
export const STAGES: { key: string; label: string; statuses: string[] }[] = [
  { key: "draft", label: UI.columnDraft, statuses: ["draft"] },
  { key: "in_review", label: UI.columnInReview, statuses: ["in_review"] },
  { key: "changes", label: UI.columnChanges, statuses: ["changes_requested", "rewrite_requested"] },
  { key: "ai_working", label: UI.columnAiWorking, statuses: ["ai_working"] },
  { key: "live", label: UI.columnLive, statuses: ["live"] },
  { key: "archived", label: "Archív", statuses: ["archived"] },
];

export function stageOf(status: string): string {
  return (STAGES.find((s) => s.statuses.includes(status)) ?? STAGES[0]).label;
}

const DAY = 86_400_000;
const ITEM_TAKE = 400;
const DECISION_TAKE = 100;
const COMMENT_MAX = 160;
const WHO = { aron: "Áron", peter: "Péter", either: "bárki" } as const;
const STATE_HU: Record<string, string> = { open: UI.checkStateOpen, resolved: UI.checkStateResolved, waived: UI.checkStateWaived };

const weeklyCached = unstable_cache(
  async (tenantId: number) => {
    const w = await getWeeklyReport(tenantId, lastDays(7));
    return { leads: w.leadsTotal, calls: w.callsTotal, demos: w.demos.booked };
  },
  ["assistant-weekly"],
  { revalidate: 600 },
);

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const flat = (s: string) => s.replace(/\s*[\r\n]+\s*/g, " ").trim();

/**
 * Queries in the single Promise.all: items, archived count, reviewers (tenant + users, 2),
 * decisions = 5, plus the badge count (React-cached). Patchnotes is cached by getPatchnotes (GitHub, no DB); weekly is cached
 * here (10 min), so a cache miss adds the report's own queries once per 10 minutes.
 */
export async function loadHubData(tenantId: number, userId: number, userName: string, now: Date = new Date()): Promise<HubData> {
  const [items, archivedCount, reviewers, decisions, patch, weekly, pendingCount] = await Promise.all([
    db.contentItem.findMany({
      where: { tenantId, status: { not: "archived" } },
      orderBy: { updatedAt: "desc" }, take: ITEM_TAKE,
      select: {
        id: true, title: true, category: true, status: true, updatedAt: true,
        campaign: { select: { name: true } },
        checks: { where: { state: "open" }, select: { source: true }, take: 50 },
        currentVersion: {
          select: {
            number: true, createdAt: true,
            reviews: { orderBy: { updatedAt: "desc" }, select: { reviewerUserId: true, comment: true, reviewer: { select: { name: true } } } },
          },
        },
      },
    }),
    db.contentItem.count({ where: { tenantId, status: "archived" } }),
    (async () => {
      const t = await db.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
      const ids = reviewersFromSettings(t?.settings);
      const users = ids.length ? await db.user.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, name: true } }) : [];
      return ids.map((id) => users.find((u) => u.id === id)).filter((u): u is { id: number; name: string } => Boolean(u));
    })(),
    db.contentCheck.findMany({
      // Open set = /marketing/decisions (openDecisionsWhere); answered/waived decision-category checks as before.
      where: { tenantId, OR: [openDecisionsWhere(tenantId), { state: { not: "open" }, OR: [{ source: "decision" }, { item: { category: "decision" } }] }] },
      orderBy: { createdAt: "desc" }, take: DECISION_TAKE,
      select: { id: true, itemId: true, question: true, forWhom: true, state: true, answer: true, createdAt: true, item: { select: { sourceMeta: true } } },
    }),
    getPatchnotes().then((p) => {
      if (!p.configured) return null;
      return {
        merged7: p.repos.reduce((a, r) => a + r.merged7, 0),
        backlog: p.repos.reduce((a, r) => a + r.backlog.length, 0),
        decisionAron: p.repos.reduce((a, r) => a + r.decisionAron.length, 0),
      };
    }).catch(() => null),
    weeklyCached(tenantId).catch(() => null),
    countPendingForReviewer(tenantId, userId),
  ]);

  const isReviewer = reviewers.some((r) => r.id === userId);
  const mineItems: number[] = [];
  const hubItems: HubItem[] = items.map((r) => {
    const v = r.currentVersion;
    const reviews = v?.reviews ?? [];
    const inReview = r.status === "draft" || r.status === "in_review";
    const withComment = reviews.find((x) => x.comment);
    const bounced = (r.status === "changes_requested" || r.status === "rewrite_requested") && r.checks.some((c) => c.source === "rule");
    if ((isReviewer && inReview && !reviews.some((x) => x.reviewerUserId === userId)) || bounced) mineItems.push(r.id);
    return {
      id: r.id, title: r.title, category: r.category, status: r.status, stage: stageOf(r.status),
      version: v?.number ?? null, openChecks: r.checks.length,
      owedBy: inReview ? reviewers.filter((u) => !reviews.some((x) => x.reviewerUserId === u.id)).map((u) => u.name) : [],
      ageDays: Math.max(0, Math.floor((now.getTime() - (v?.createdAt ?? r.updatedAt).getTime()) / DAY)),
      updatedAt: r.updatedAt.toISOString(),
      lastComment: withComment ? { by: withComment.reviewer.name, text: withComment.comment!.slice(0, COMMENT_MAX) } : null,
      campaign: r.campaign?.name ?? null,
    };
  });

  const me = fold(userName.trim().split(/\s+/)[0] ?? "");
  const hubDecisions: HubDecision[] = [...new Map(decisions.map((c) => [c.id, c])).values()].map((c) => {
    const dl = (c.item.sourceMeta as { deadline?: unknown } | null)?.deadline;
    return {
      checkId: c.id, itemId: c.itemId, question: c.question,
      forWhom: c.forWhom === "aron" || c.forWhom === "peter" ? c.forWhom : "either",
      state: c.state, answer: c.answer,
      deadline: typeof dl === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dl) ? dl : null,
      daysWaiting: c.state === "open" ? Math.max(0, Math.floor((now.getTime() - c.createdAt.getTime()) / DAY)) : 0,
    };
  });
  const checkIds = isReviewer ? hubDecisions.filter((d) => d.state === "open" && (d.forWhom === "either" || d.forWhom === me)).map((d) => d.checkId) : [];

  return {
    now, items: hubItems, archivedCount, decisions: hubDecisions,
    mine: { itemIds: mineItems, checkIds }, pendingCount, patch, weekly, truncatedQuery: items.length >= ITEM_TAKE,
  };
}

// Data never contains "<": no nested or spaced variant can rebuild a tag (Vanda r3).
const clean = (s: string) => flat(s.replace(/</g, "‹"));

export function renderHubContext(d: HubData, opts: { budgetChars?: number } = {}): string {
  const budget = opts.budgetChars ?? HUB_CONTEXT_BUDGET_CHARS;
  const items = [...d.items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  // Every stage names its item ids (up to 40), so "mi van a vázlatokban?" maps to ids even when
  // the item lines are truncated (prod smoke 2026-10-07: 2 drafts, compact-only, model said "Nem tudom").
  const idCap = budget < 3000 ? 8 : 40; // tight budgets (post-read hop) keep the stage line short
  const counts = STAGES.map((s) => {
    if (s.key === "archived") return `${s.label}: ${d.archivedCount}`;
    const ids = items.filter((i) => s.statuses.includes(i.status)).map((i) => `#${i.id}`);
    return `${s.label}: ${ids.length}${ids.length ? ` (${ids.slice(0, idCap).join(", ")}${ids.length > idCap ? ", ..." : ""})` : ""}`;
  });
  const decLine = (x: HubDecision) =>
    `kérdés #${x.checkId} | ${clean(x.question)} | kitől: ${WHO[x.forWhom]} | állapot: ${STATE_HU[x.state] ?? x.state} | határidő: ${x.deadline ?? "nincs"} | vár ${x.daysWaiting} nap | válasz: ${x.answer ? clean(x.answer) : "nincs"} | link /marketing/decisions#${x.checkId}`;
  const full = (i: HubItem) =>
    `#${i.id} | ${clean(i.title)} | ${CATEGORY_LABEL[i.category as ContentCategory] ?? i.category} | ${i.stage} | v${i.version ?? "-"} | nyitott kérdés: ${i.openChecks} | jóváhagyásra vár: ${i.owedBy.length ? i.owedBy.map(clean).join(", ") : "senki"} | kor: ${i.ageDays} nap | utolsó megjegyzés: ${i.lastComment ? `${clean(i.lastComment.by)}: "${clean(i.lastComment.text)}"` : "nincs"} | /marketing/${i.id}${i.campaign ? ` | kampány: ${clean(i.campaign)}` : ""}`;
  const compact = (i: HubItem) => `#${i.id} ${clean(i.title).slice(0, 80)} [${i.stage}]`;

  const byId = new Map(items.map((i) => [i.id, i]));
  const decById = new Map(d.decisions.map((x) => [x.checkId, x]));
  // Totals are server-computed, so only the oldest few are listed: 34 + 16 full lines were ~6000 chars,
  // most of the 7000 budget, and ÖNRE VÁR is never dropped.
  const tight = budget < 3000;
  const ownItems = d.mine.itemIds.slice(0, tight ? 5 : 10).flatMap((id) => {
    const i = byId.get(id);
    return i ? [`#${id} ${clean(i.title)} | ${i.stage} | jóváhagyásra vár: ${i.owedBy.length ? i.owedBy.map(clean).join(", ") : "senki"} | /marketing/${id}`] : [];
  });
  const ownDecs = d.mine.checkIds.slice(0, tight ? 3 : 5).flatMap((id) => {
    const x = decById.get(id);
    return x ? [`kérdés #${id} ${clean(x.question)} | kitől: ${WHO[x.forWhom]} | /marketing/decisions#${id}`] : [];
  });
  const own = [
    `ÖNRE VÁR: ${d.pendingCount} anyag az Ön bírálatára vár; ${d.mine.checkIds.length} nyitott döntés.`,
    "FONTOS: a számokat ebből a sorból vegye, ne számolja meg a sorokat.",
    ...ownItems, ...ownDecs,
  ];
  const patch = d.patch ? `merged 7 nap: ${d.patch.merged7}; nyitott backlog: ${d.patch.backlog}; Áron döntésére váró issue: ${d.patch.decisionAron}` : "(nincs adat)";
  const weekly = d.weekly ? `leads: ${d.weekly.leads}; hívások: ${d.weekly.calls}; demók: ${d.weekly.demos}` : "(nincs adat)";

  const build = (decisions: HubDecision[], fullItems: HubItem[], compactItems: HubItem[], omitted: number) => {
    const order = (i: HubItem) => STAGES.findIndex((s) => s.label === i.stage);
    const compactSorted = [...compactItems].sort((a, b) => order(a) - order(b));
    return [
      "<crm>",
      "SZAKASZOK:", counts.join("; "),
      ...own,
      "DÖNTÉSEK:", ...(decisions.length ? decisions.map(decLine) : ["(nincs)"]),
      "FEJLESZTÉS (patchnotes):", patch,
      "HETI SZÁMOK (7 nap):", weekly,
      "ANYAGOK:", ...(fullItems.length ? fullItems.map(full) : ["(nincs)"]), ...compactSorted.map(compact),
      ...(omitted || d.truncatedQuery
        ? [`FIGYELEM: a lista csonkolt; ${omitted} anyag csak számként szerepel. Részletekért használja a read_item_ids eszközt.`]
        : []),
      "</crm>",
    ].join("\n");
  };

  // A tight budget (the post-read hop) keeps only 5 open decisions: 30 lines alone are ~6000 chars.
  let decs = budget < 3000 ? d.decisions.filter((x) => x.state === "open").slice(0, 5) : d.decisions;
  const text = build(decs, items, [], 0);
  if (text.length <= budget && !d.truncatedQuery) return text;

  if (decs.length > 30 && build(decs, items.slice(0, 20), [], items.length - 20).length > budget) decs = decs.slice(0, 30);
  // ponytail: binary search on the compact count, 20 full lines shrink only if they alone overflow.
  for (let fullN = Math.min(20, items.length); fullN >= 0; fullN--) {
    const head = items.slice(0, fullN);
    const rest = items.slice(fullN);
    if (build(decs, head, [], rest.length).length > budget) continue;
    let lo = 0, hi = rest.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (build(decs, head, rest.slice(0, mid), rest.length - mid).length <= budget) lo = mid;
      else hi = mid - 1;
    }
    return build(decs, head, rest.slice(0, lo), rest.length - lo);
  }
  return build(decs, [], [], items.length);
}
