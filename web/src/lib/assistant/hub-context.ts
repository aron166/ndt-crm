// Hungarian copy is PROPOSAL until Áron approves.
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { CATEGORY_LABEL, UI } from "@/lib/content/labels";
import { countPendingForReviewer, openDecisionsWhere } from "@/lib/content/queries";
import { reviewersFromSettings } from "@/lib/content/reviewers";
import { getPatchnotes } from "@/lib/patchnotes/github";
import { getWeeklyReport, lastDays } from "@/lib/reports/weekly";
import type { ContentCategory } from "@/lib/content/types";

/**
 * ~1.1K tokens of CRM state per message (Hungarian ~2.6 chars/token, measured on prod 2026-10-07).
 * Groq free tier is 8K tokens/min (prompt + reply); 6000 chars here made the second question 429.
 */
export const HUB_CONTEXT_BUDGET_CHARS = 2800;

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

export type HubIntent = { kind: "waiting" } | { kind: "stage"; stage: string } | { kind: "general" };

/**
 * Routes the question to the context it needs (Groq free tier 8K TPM: the whole page summary
 * on every call ran ~4.4K prompt tokens and the second question hit 429, QA walk 2026-10-07).
 * ponytail: keyword match on the folded text; a miss falls back to "general" plus the read tool.
 * Archív is not a stage route: archived items are not loaded, its count is in SZAKASZOK.
 */
export function routeIntent(message: string): HubIntent {
  const m = fold(message);
  if (/\bvar ram\b|\bram var\b|\bonre var|teendo|\bdolgom\b/.test(m)) return { kind: "waiting" };
  const stages: [RegExp, string][] = [
    [/\bvazlat(ok|okban|ban|ok kozott)?\b|\bdraft/, "draft"],
    [/biralat(ra|on|ban)\b|\bin review\b/, "in_review"],
    [/javitas kell|javitasra|ujrairas|visszadob/, "changes"],
    [/\bai (ir|dolgoz)|\bai_working/, "ai_working"],
    [/\belo anyag|\belok\b|\belesben\b|\beles anyag|\blive\b/, "live"],
  ];
  for (const [re, stage] of stages) if (re.test(m)) return { kind: "stage", stage };
  return { kind: "general" };
}

/**
 * Every item id in the output is printed with its title (no bare id lists): bare ids made the
 * model answer "#31 (adat hiányzik)" (#149). A short fixed head (counts, totals, numbers), then
 * one optional pool per intent, trimmed from the end until it fits the budget.
 */
export function renderHubContext(d: HubData, opts: { budgetChars?: number; intent?: HubIntent } = {}): string {
  const budget = opts.budgetChars ?? HUB_CONTEXT_BUDGET_CHARS;
  const intent = opts.intent ?? { kind: "general" };
  const items = [...d.items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const byId = new Map(items.map((i) => [i.id, i]));
  const decById = new Map(d.decisions.map((x) => [x.checkId, x]));

  const counts = STAGES.map((s) => `${s.label}: ${s.key === "archived" ? d.archivedCount : items.filter((i) => s.statuses.includes(i.status)).length}`);
  const decShort = (x: HubDecision) =>
    `kérdés #${x.checkId} ${clean(x.question).slice(0, 120)} | kitől: ${WHO[x.forWhom]} | határidő: ${x.deadline ?? "nincs"} | vár ${x.daysWaiting} nap | /marketing/decisions#${x.checkId}`;
  const decAnswered = (x: HubDecision) =>
    `kérdés #${x.checkId} ${clean(x.question).slice(0, 100)} | ${STATE_HU[x.state] ?? x.state} | válasz: ${x.answer ? clean(x.answer).slice(0, 120) : "nincs"}`;
  const full = (i: HubItem) =>
    `#${i.id} | ${clean(i.title)} | ${CATEGORY_LABEL[i.category as ContentCategory] ?? i.category} | ${i.stage} | v${i.version ?? "-"} | nyitott kérdés: ${i.openChecks} | jóváhagyásra vár: ${i.owedBy.length ? i.owedBy.map(clean).join(", ") : "senki"} | kor: ${i.ageDays} nap | utolsó megjegyzés: ${i.lastComment ? `${clean(i.lastComment.by)}: "${clean(i.lastComment.text)}"` : "nincs"} | /marketing/${i.id}${i.campaign ? ` | kampány: ${clean(i.campaign)}` : ""}`;
  const compact = (i: HubItem) => `#${i.id} ${clean(i.title).slice(0, 80)} [${i.stage}]`;
  const ownItem = (id: number) => {
    const i = byId.get(id);
    return i ? [`#${id} ${clean(i.title)} | ${i.stage} | jóváhagyásra vár: ${i.owedBy.length ? i.owedBy.map(clean).join(", ") : "senki"} | /marketing/${id}`] : [];
  };
  const ownDec = (id: number) => {
    const x = decById.get(id);
    return x ? [`kérdés #${id} ${clean(x.question).slice(0, 120)} | kitől: ${WHO[x.forWhom]} | /marketing/decisions#${id}`] : [];
  };
  // Oldest waiting first; totals are server-computed, so a few lines are enough.
  const oldestMine = [...d.mine.itemIds].sort((a, b) => (byId.get(b)?.ageDays ?? 0) - (byId.get(a)?.ageDays ?? 0));
  const own = (nItems: number, nDecs: number) => [...oldestMine.slice(0, nItems).flatMap(ownItem), ...d.mine.checkIds.slice(0, nDecs).flatMap(ownDec)];

  const head = ["<crm>", "SZAKASZOK:", counts.join("; "), `ÖNRE VÁR: ${d.pendingCount} anyag vár Önre; ${d.mine.checkIds.length} nyitott döntés.`];
  // Pool lines in priority order; `item: true` lines count toward the FIGYELEM omitted number.
  let pool: { text: string; item?: boolean }[] = [];
  const L = (text: string, item = false) => ({ text, item });
  if (intent.kind === "waiting") {
    pool = own(10, 5).map((t) => L(t));
  } else if (intent.kind === "stage") {
    const s = STAGES.find((x) => x.key === intent.stage) ?? STAGES[0];
    const listed = items.filter((i) => s.statuses.includes(i.status));
    head.push(`ANYAGOK (${s.label}):`, ...(listed.length ? [] : ["(nincs)"]));
    // A short stage in full; a long one as id + title (the stage is in the header), so all 32
    // in-review items of the prod board fit (~2.3K chars).
    pool = listed.map((i) => L(listed.length <= 6 ? full(i) : `#${i.id} ${clean(i.title).slice(0, 64)}`, true));
  } else {
    const patch = d.patch ? `merged 7 nap: ${d.patch.merged7}; nyitott backlog: ${d.patch.backlog}; Áron döntésére váró issue: ${d.patch.decisionAron}` : "(nincs adat)";
    const weekly = d.weekly ? `leads: ${d.weekly.leads}; hívások: ${d.weekly.calls}; demók: ${d.weekly.demos}` : "(nincs adat)";
    head.push(`FEJLESZTÉS (patchnotes): ${patch}`, `HETI SZÁMOK (7 nap): ${weekly}`);
    const open = d.decisions.filter((x) => x.state === "open");
    const answered = d.decisions.filter((x) => x.state !== "open").slice(0, 10); // newest first (query order)
    pool = [
      ...own(3, 2).map((t) => L(t)),
      L("ANYAGOK (legutóbb módosítva):"), ...items.slice(0, 20).map((i) => L(compact(i), true)),
      L("NYITOTT DÖNTÉSEK:"), ...open.slice(0, 5).map((x) => L(decShort(x))),
      L("LEZÁRT DÖNTÉSEK (legutóbbiak):"), ...answered.map((x) => L(decAnswered(x))),
      ...items.slice(20).map((i) => L(compact(i), true)),
    ];
  }

  const totalItems = pool.filter((p) => p.item).length;
  const note = (omitted: number) => (omitted || (intent.kind !== "waiting" && d.truncatedQuery)
    ? [`FIGYELEM: a lista csonkolt; ${omitted} anyag kimaradt. Részletekért használja a read_item_ids eszközt.`]
    : []);
  // ponytail: one pass over cumulative lengths; the note is sized for the worst case.
  let used = head.join("\n").length + "\n</crm>".length + note(totalItems || 1)[0].length + 1;
  let n = 0;
  for (; n < pool.length && used + pool[n].text.length + 1 <= budget; n++) used += pool[n].text.length + 1;
  const kept = pool.slice(0, n).filter((p, k, arr) => !(p.text.endsWith(":") && !p.item && (k === arr.length - 1 || arr[k + 1].text.endsWith(":"))));
  const omitted = totalItems - pool.slice(0, n).filter((p) => p.item).length;
  return [...head, ...kept.map((p) => p.text), ...note(omitted), "</crm>"].join("\n");
}
