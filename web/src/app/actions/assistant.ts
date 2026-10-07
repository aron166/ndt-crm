"use server";
// Hungarian copy is PROPOSAL until Áron approves.

import { db } from "@/lib/db";
import { getActor, NOT_A_CRM_USER } from "@/lib/actor";
import { getContentReviewers } from "@/lib/content/reviewers";
import { AssistantError, RATE_LIMITED, assistantConfig, chatCompletion, estimateCostUsd, type ChatMessage } from "@/lib/assistant/provider";
import { loadPageData, renderPageContext } from "@/lib/assistant/page-context";
import { ACTION_INSTRUCTION, ActionProposalSchema, decisionBody, describeProposal, parseActionProposal, type ActionProposal } from "@/lib/assistant/actions";
import { submitContentReview, setContentCheck } from "@/app/actions/content";
import { createItem } from "@/lib/content/service";
import { revalidatePath } from "next/cache";
import { CAP_EXCEEDED, capState } from "@/lib/assistant/cap";
import { buildSystemPrompt, loadItemContext, pageKind } from "@/lib/assistant/context";
import { TICKET_INSTRUCTION, TicketDraftSchema, createGithubIssue, parseTicketDraft, type TicketDraft } from "@/lib/assistant/ticket";

const TENANT_ID = 1;
const NOT_CONFIGURED = "Az asszisztens nincs beállítva.";
const NOT_FOUND = "Nem található";
const MODEL_FAILED = "Az asszisztens most nem érhető el. Kérem, próbálja újra később.";
const TOO_LONG = "Ebben a beszélgetésben elérte a 20 üzenetet. Kérem, kezdjen újat.";
const BAD_INPUT = "Érvénytelen kérés.";

export type NoteView = { id: number; body: string; author: string; createdAt: string };
export type AssistantInput = { pathname: string; itemId: number | null; messages: { role: "user" | "assistant"; content: string }[] };

const validId = (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0;

function checkInput(input: AssistantInput): string | null {
  if (!input || typeof input.pathname !== "string" || input.pathname.length > 200 || pageKind(input.pathname) === null) return BAD_INPUT;
  if (input.itemId !== null && !validId(input.itemId)) return BAD_INPUT;
  const m = input.messages;
  if (!Array.isArray(m) || m.length < 1 || m.length > 40 || m[m.length - 1]?.role !== "user") return BAD_INPUT;
  for (const x of m) {
    if ((x?.role !== "user" && x?.role !== "assistant") || typeof x.content !== "string" || x.content.length < 1 || x.content.length > (x.role === "user" ? 2000 : 6000)) return BAD_INPUT;
  }
  if (m.filter((x) => x.role === "user").length > 20) return TOO_LONG;
  return null;
}

const noteView = (n: { id: number; body: string; createdAt: Date; user: { name: string | null } | null }): NoteView => ({
  id: n.id, body: n.body, author: n.user?.name ?? "", createdAt: n.createdAt.toISOString(),
});

type Purpose = "explain" | "ticket" | "propose";

function logCall(userId: number, input: AssistantInput, purpose: Purpose, model: string, promptTokens: number, completionTokens: number) {
  return db.assistantCall.create({
    data: {
      tenantId: TENANT_ID, userId, page: input.pathname, purpose, itemId: input.itemId, model,
      promptTokens, completionTokens, costUsd: estimateCostUsd(promptTokens, completionTokens),
    },
  });
}

/** Last 6 messages, older ones dropped further until under 4000 chars; the last (user) message always stays. */
function trimHistory<T extends { content: string }>(ms: T[]): T[] {
  let h = ms.slice(-6);
  while (h.length > 1 && h.reduce((n, x) => n + x.content.length, 0) >= 4000) h = h.slice(1);
  return h;
}

/** Shared by askAssistant, draftTicket and proposeAction: validate, cap, call, log. */
async function run(userId: number, input: AssistantInput, purpose: Purpose): Promise<{ text: string } | { error: string }> {
  const bad = checkInput(input);
  if (bad) return { error: bad };
  const cfg = assistantConfig();
  if (!cfg) return { error: NOT_CONFIGURED };

  // List pages see the whole page (items, decisions, own pending); an item page sees the item.
  // Propose sees the page only when no item is open (an item page sends the item alone: token budget).
  const onList = pageKind(input.pathname) !== "item";
  const withPage = purpose === "propose" ? input.itemId === null : onList;
  const [item, cap, user, reviewers, page] = await Promise.all([
    input.itemId !== null ? loadItemContext(TENANT_ID, input.itemId) : Promise.resolve(null),
    capState(TENANT_ID),
    db.user.findFirst({ where: { id: userId, tenantId: TENANT_ID }, select: { role: true, name: true } }),
    getContentReviewers(TENANT_ID),
    withPage ? loadPageData(TENANT_ID, userId).then((d) => renderPageContext(d)) : Promise.resolve(null),
  ]);
  if (input.itemId !== null && !item) return { error: NOT_FOUND };
  if (cap.exceeded) return { error: CAP_EXCEEDED };
  const extra = purpose === "ticket" ? TICKET_INSTRUCTION : purpose === "propose" ? ACTION_INSTRUCTION : null;
  const messages: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt({ pathname: input.pathname, item, role: user?.role ?? "user", isReviewer: reviewers.includes(userId), page }) },
    ...(extra ? [{ role: "system", content: extra } as ChatMessage] : []),
    ...trimHistory(input.messages),
  ];

  let r;
  try {
    // gpt-oss reasons before it answers; the JSON purposes get headroom for that.
    r = await chatCompletion(cfg, messages, purpose === "explain" ? { maxTokens: 1200 } : { json: true, maxTokens: 1500 });
  } catch (e) {
    // A 2xx with an unusable reply may still have been billed: count it against the cap.
    if (e instanceof AssistantError && e.usage) await logCall(userId, input, purpose, cfg.model, e.usage.promptTokens, e.usage.completionTokens);
    if (e instanceof AssistantError && e.status === 429) return { error: RATE_LIMITED };
    return { error: MODEL_FAILED };
  }
  await logCall(userId, input, purpose, cfg.model, r.promptTokens, r.completionTokens);
  return { text: r.text };
}

export async function openAssistant(input: { itemId: number | null }): Promise<{ ok: true; configured: boolean; item: { id: number; title: string } | null; notes: NoteView[] } | { error: string }> {
  const { userId } = await getActor(TENANT_ID);
  if (userId == null) return { error: NOT_A_CRM_USER };
  if (input?.itemId !== null && !validId(input?.itemId)) return { error: BAD_INPUT };

  let item: { id: number; title: string } | null = null;
  let notes: NoteView[] = [];
  if (input.itemId !== null) {
    item = await db.contentItem.findFirst({ where: { id: input.itemId, tenantId: TENANT_ID }, select: { id: true, title: true } });
    if (!item) return { error: NOT_FOUND };
    const rows = await db.contentNote.findMany({
      where: { tenantId: TENANT_ID, itemId: input.itemId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, body: true, createdAt: true, user: { select: { name: true } } },
    });
    notes = rows.map(noteView);
  }
  return { ok: true as const, configured: assistantConfig() != null, item, notes };
}

export async function askAssistant(input: AssistantInput): Promise<{ ok: true; reply: string } | { error: string }> {
  const { userId } = await getActor(TENANT_ID);
  if (userId == null) return { error: NOT_A_CRM_USER };
  const r = await run(userId, input, "explain");
  return "error" in r ? r : { ok: true, reply: r.text };
}

export async function draftTicket(input: AssistantInput): Promise<{ ok: true; draft: TicketDraft } | { error: string }> {
  const { userId } = await getActor(TENANT_ID);
  if (userId == null) return { error: NOT_A_CRM_USER };
  const r = await run(userId, input, "ticket");
  if ("error" in r) return r;
  const draft = parseTicketDraft(r.text);
  return draft ? { ok: true, draft } : { error: "Nem sikerült jegyet készíteni. Kérem, fogalmazza meg másképp, mi a gond." };
}

export async function fileTicket(draft: TicketDraft): Promise<{ ok: true; url: string } | { ok: true; fallbackUrl: string } | { error: string }> {
  const { userId } = await getActor(TENANT_ID);
  if (userId == null) return { error: NOT_A_CRM_USER };
  const parsed = TicketDraftSchema.safeParse(draft);
  if (!parsed.success) return { error: BAD_INPUT };
  // Provenance appended server-side: the body is client-edited, the author is not.
  const user = await db.user.findFirst({ where: { id: userId, tenantId: TENANT_ID }, select: { name: true } });
  const body = `${parsed.data.body}\n\n---\nBeküldve a CRM asszisztensből, beküldő: ${user?.name ?? `user ${userId}`}`;
  const r = await createGithubIssue({ ...parsed.data, body });
  return r.ok ? { ok: true, url: r.url } : { ok: true, fallbackUrl: r.fallbackUrl };
}

export async function addItemNote(input: { itemId: number; body: string }): Promise<{ ok: true; note: NoteView } | { error: string }> {
  const { userId } = await getActor(TENANT_ID);
  if (userId == null) return { error: NOT_A_CRM_USER };
  const body = typeof input?.body === "string" ? input.body.trim() : "";
  if (!validId(input?.itemId) || body.length < 1 || body.length > 4000) return { error: BAD_INPUT };
  const item = await db.contentItem.findFirst({ where: { id: input.itemId, tenantId: TENANT_ID }, select: { id: true } });
  if (!item) return { error: NOT_FOUND };
  const note = await db.contentNote.create({
    data: { tenantId: TENANT_ID, itemId: item.id, userId, body },
    select: { id: true, body: true, createdAt: true, user: { select: { name: true } } },
  });
  return { ok: true, note: noteView(note) };
}

// ── v2 abilities (ADR/019 15:00): "Mi vár rám?", propose -> confirm -> execute ──

export type WaitingView = {
  items: { id: number; title: string; href: string; days: number | null }[];
  decisions: { checkId: number; question: string; href: string; forWhom: string; deadline: string | null; days: number }[];
};

/** "Mi vár rám?": deterministic, no model call, so it works without a key and costs nothing. */
export async function whatsWaiting(): Promise<{ ok: true; waiting: WaitingView } | { error: string }> {
  const { userId } = await getActor(TENANT_ID);
  if (userId == null) return { error: NOT_A_CRM_USER };
  const [reviewers, user] = await Promise.all([
    getContentReviewers(TENANT_ID),
    db.user.findFirst({ where: { id: userId, tenantId: TENANT_ID }, select: { name: true } }),
  ]);
  if (!reviewers.includes(userId)) return { ok: true, waiting: { items: [], decisions: [] } };
  const d = await loadPageData(TENANT_ID, userId);
  const now = d.now.getTime();
  // ponytail: forWhom is aron|peter|either with no user mapping in the schema; match on the
  // first name, and show every open decision when the name matches neither.
  const first = (user?.name ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/\s+/);
  const me = first.includes("peter") ? "peter" : first.includes("aron") ? "aron" : null;
  return {
    ok: true,
    waiting: {
      items: d.items
        .filter((i) => (i.status === "in_review" || i.status === "draft") && i.verdicts.some((v) => v.reviewerId === userId && v.verdict === null))
        .map((i) => ({
          id: i.id, title: i.title, href: `/marketing/${i.id}`,
          days: i.waitingSince ? Math.floor((now - Date.parse(i.waitingSince)) / 86_400_000) : null,
        })),
      decisions: d.decisions
        .filter((x) => !me || x.forWhom === me || x.forWhom === "either")
        .map((x) => ({ checkId: x.checkId, question: x.question, href: `/marketing/${x.item.id}`, forWhom: x.forWhom, deadline: x.deadline, days: x.daysWaiting })),
    },
  };
}

export type ProposalView = { proposal: ActionProposal; summary: string };

/** The model turns the request into ONE action proposal. Nothing is written here. */
export async function proposeAction(input: AssistantInput): Promise<{ ok: true; view: ProposalView } | { error: string }> {
  const { userId } = await getActor(TENANT_ID);
  if (userId == null) return { error: NOT_A_CRM_USER };
  const r = await run(userId, input, "propose");
  if ("error" in r) return r;
  const p = parseActionProposal(r.text);
  if (!p) return { error: "Nem értettem, mit tegyek. Kérem, fogalmazza meg pontosabban." };
  // Resolve the ids the model named against the tenant so the confirm card shows real titles.
  const names: { itemTitle?: string; question?: string } = {};
  if (p.type === "review" || p.type === "note") {
    const item = await db.contentItem.findFirst({ where: { id: p.itemId, tenantId: TENANT_ID }, select: { title: true, currentVersionId: true } });
    if (!item) return { error: NOT_FOUND };
    names.itemTitle = item.title;
    if (p.type === "review") {
      if (item.currentVersionId == null) return { error: NOT_FOUND };
      p.versionId = item.currentVersionId;
    }
  } else if (p.type === "answer_decision") {
    const c = await db.contentCheck.findFirst({ where: { id: p.checkId, tenantId: TENANT_ID, state: "open" }, select: { question: true } });
    if (!c) return { error: NOT_FOUND };
    names.question = c.question;
  }
  return { ok: true, view: { proposal: p, summary: describeProposal(p, names) } };
}

async function logExecuted(userId: number, action: string, itemId: number | null) {
  await db.assistantCall.create({
    data: {
      tenantId: TENANT_ID, userId, page: "/marketing", purpose: "execute", action, itemId,
      model: "-", promptTokens: 0, completionTokens: 0, costUsd: 0,
    },
  });
}

/**
 * Runs a proposal the user CONFIRMED in the panel. Every branch goes through the
 * existing write path (verdicts and checks through the content actions, so the
 * reviewer gate, dual approval, claims, live webhook and audit all apply).
 */
export async function executeAction(raw: ActionProposal): Promise<{ ok: true; message: string; href?: string } | { error: string }> {
  const { userId } = await getActor(TENANT_ID);
  if (userId == null) return { error: NOT_A_CRM_USER };
  const parsed = ActionProposalSchema.safeParse(raw);
  if (!parsed.success || parsed.data.type === "none") return { error: BAD_INPUT };
  const p = parsed.data;

  if (p.type === "review") {
    // The version the user confirmed: a newer one landing since makes the service answer 409.
    if (p.versionId == null) return { error: BAD_INPUT };
    const v = await db.contentVersion.findFirst({ where: { id: p.versionId, itemId: p.itemId, tenantId: TENANT_ID }, select: { id: true } });
    if (!v) return { error: NOT_FOUND };
    const r = await submitContentReview({ versionId: p.versionId, verdict: p.verdict, comment: p.comment, reason: p.reason });
    if (!r.ok) return { error: r.error };
    await logExecuted(userId, "review", p.itemId);
    return { ok: true, message: r.wentLive ? "Rögzítve, az anyag élesbe került." : "Rögzítve.", href: `/marketing/${p.itemId}` };
  }
  if (p.type === "answer_decision") {
    const c = await db.contentCheck.findFirst({ where: { id: p.checkId, tenantId: TENANT_ID }, select: { itemId: true } });
    if (!c) return { error: NOT_FOUND };
    const r = await setContentCheck({ checkId: p.checkId, state: "resolved", text: p.answer });
    if (!r.ok) return { error: r.error };
    await logExecuted(userId, "answer_decision", c.itemId);
    return { ok: true, message: "A válasz rögzítve.", href: `/marketing/${c.itemId}` };
  }
  if (p.type === "create_decision") {
    // Same gate as answering: only a reviewer may put a question on the Döntések page.
    if (!(await getContentReviewers(TENANT_ID)).includes(userId)) return { error: "Csak bíráló hozhat létre döntést." };
    const actor = { tenantId: TENANT_ID, kind: "user" as const, userId };
    const created = await db.$transaction(async (tx) => {
      const c = await createItem(actor, {
        title: p.question, body: decisionBody(p), category: "decision", channel: "other", contentType: "other",
        source: "assistant", ...(p.deadline ? { sourceMeta: { deadline: p.deadline } } : {}),
      }, tx);
      if (!c.ok) return c;
      await tx.contentCheck.create({ data: { tenantId: TENANT_ID, itemId: c.itemId, question: p.question, forWhom: p.decidedBy, source: "decision" } });
      return c;
    });
    if (!created.ok) return { error: created.error };
    await logExecuted(userId, "create_decision", created.itemId);
    revalidatePath("/marketing");
    revalidatePath("/marketing/decisions");
    return { ok: true, message: "A döntés felkerült a Döntések oldalra.", href: `/marketing/${created.itemId}` };
  }
  if (p.type === "note") {
    const r = await addItemNote({ itemId: p.itemId, body: p.body });
    if ("error" in r) return r;
    await logExecuted(userId, "note", p.itemId);
    return { ok: true, message: "Jegyzet mentve.", href: `/marketing/${p.itemId}` };
  }
  const r = await fileTicket(p.draft);
  if ("error" in r) return r;
  await logExecuted(userId, "ticket", null);
  return "url" in r ? { ok: true, message: "Hibajegy létrehozva.", href: r.url } : { ok: true, message: "Nyissa meg a kitöltött jegyet:", href: r.fallbackUrl };
}
