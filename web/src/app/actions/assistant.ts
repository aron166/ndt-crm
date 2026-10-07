"use server";
// Hungarian copy is PROPOSAL until Áron approves.

import { db } from "@/lib/db";
import { reportError } from "@/lib/report-error";
import { getActor, NOT_A_CRM_USER } from "@/lib/actor";
import { getContentReviewers } from "@/lib/content/reviewers";
import { assistantConfig } from "@/lib/assistant/provider";
import { loadPageData } from "@/lib/assistant/page-context";
import { ActionProposalSchema, CLIENT_ACTIONS, decisionBody, type ActionProposal } from "@/lib/assistant/actions";
import { submitContentReview, setContentCheck } from "@/app/actions/content";
import { addChecks, createItem } from "@/lib/content/service";
import { revalidatePath } from "next/cache";
import { STATUS_LABELS } from "@/lib/marketing/types";
import type { ContentStatus } from "@/lib/content/types";
import { RECENT_CONVERSATIONS, type ChatTurn, type ConversationSummary, type ConversationView } from "@/lib/assistant/chat-types";
import { TicketDraftSchema, createGithubIssue, type TicketDraft } from "@/lib/assistant/ticket";

const TENANT_ID = 1;
const NOT_FOUND = "Nem található";
const BAD_INPUT = "Érvénytelen kérés.";
const MODEL_FAILED_WRITE = "Nem sikerült menteni. Kérem, próbálja újra.";
/** The one error the decision transaction throws on purpose (rolls the item back). */
class CheckFail extends Error {}

export type NoteView = { id: number; body: string; author: string; createdAt: string };

const validId = (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0 && (v as number) <= 2147483647;

const noteView = (n: { id: number; body: string; createdAt: Date; user: { name: string | null } | null }): NoteView => ({
  id: n.id, body: n.body, author: n.user?.name ?? "", createdAt: n.createdAt.toISOString(),
});

type OpenResult = {
  ok: true; configured: boolean; item: { id: number; title: string } | null; notes: NoteView[];
  conversations: ConversationSummary[]; conversation: ConversationView | null;
};

const CONV_SELECT = { id: true, title: true, updatedAt: true, page: true, itemId: true, messages: true } as const;
const convView = (c: { id: number; title: string; updatedAt: Date; page: string; itemId: number | null; messages: unknown }): ConversationView => ({
  id: c.id, title: c.title, updatedAt: c.updatedAt.toISOString(), page: c.page, itemId: c.itemId,
  messages: Array.isArray(c.messages) ? (c.messages as ChatTurn[]) : [],
});
/** Owner scope for every conversation read and write: this tenant, this user, not deleted. */
const ownConv = (userId: number, id?: number) => ({ tenantId: TENANT_ID, userId, deletedAt: null, ...(id ? { id } : {}) });

/** One request per drawer open: item title, notes, recent conversations and the remembered one. */
export async function openAssistant(input: { itemId: number | null; conversationId: number | null }): Promise<OpenResult | { error: string }> {
  const { userId } = await getActor(TENANT_ID);
  if (userId == null) return { error: NOT_A_CRM_USER };
  if (input?.itemId !== null && !validId(input?.itemId)) return { error: BAD_INPUT };
  if (input?.conversationId != null && !validId(input.conversationId)) return { error: BAD_INPUT };

  const [item, rows, conversations, conversation] = await Promise.all([
    input.itemId !== null ? db.contentItem.findFirst({ where: { id: input.itemId, tenantId: TENANT_ID }, select: { id: true, title: true } }) : null,
    input.itemId !== null
      ? db.contentNote.findMany({
          where: { tenantId: TENANT_ID, itemId: input.itemId },
          orderBy: { createdAt: "desc" },
          take: 50,
          select: { id: true, body: true, createdAt: true, user: { select: { name: true } } },
        })
      : [],
    db.assistantConversation.findMany({
      where: ownConv(userId), orderBy: { updatedAt: "desc" }, take: RECENT_CONVERSATIONS,
      select: { id: true, title: true, updatedAt: true },
    }),
    input.conversationId ? db.assistantConversation.findFirst({ where: ownConv(userId, input.conversationId), select: CONV_SELECT }) : null,
  ]);
  if (input.itemId !== null && !item) return { error: NOT_FOUND };
  return {
    ok: true as const, configured: assistantConfig() != null, item, notes: rows.map(noteView),
    conversations: conversations.map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt.toISOString() })),
    conversation: conversation ? convView(conversation) : null,
  };
}

export async function getConversation(id: number): Promise<{ ok: true; conversation: ConversationView } | { error: string }> {
  const { userId } = await getActor(TENANT_ID);
  if (userId == null) return { error: NOT_A_CRM_USER };
  if (!validId(id)) return { error: BAD_INPUT };
  const c = await db.assistantConversation.findFirst({ where: ownConv(userId, id), select: CONV_SELECT });
  return c ? { ok: true, conversation: convView(c) } : { error: NOT_FOUND };
}

/** Soft delete; logged in assistant_calls (purpose conversation, action delete). */
export async function deleteConversation(id: number): Promise<{ ok: true } | { error: string }> {
  const { userId } = await getActor(TENANT_ID);
  if (userId == null) return { error: NOT_A_CRM_USER };
  if (!validId(id)) return { error: BAD_INPUT };
  const r = await db.assistantConversation.updateMany({ where: ownConv(userId, id), data: { deletedAt: new Date() } });
  if (r.count === 0) return { error: NOT_FOUND };
  await db.assistantCall.create({
    data: {
      tenantId: TENANT_ID, userId, page: "/marketing", purpose: "conversation", action: "delete", conversationId: id,
      model: "-", promptTokens: 0, completionTokens: 0, costUsd: 0,
    },
  });
  return { ok: true };
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
        .filter((i) => (d.mineIds ?? []).includes(i.id))
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

/** Never throws: a log failure after the write must not release a card that did run. */
async function logExecuted(userId: number, action: string, itemId: number | null) {
  await db.assistantCall.create({
    data: {
      tenantId: TENANT_ID, userId, page: "/marketing", purpose: "execute", action, itemId,
      model: "-", promptTokens: 0, completionTokens: 0, costUsd: 0,
    },
  }).catch((e: unknown) => reportError("assistant.logExecuted", e, { userId, action }));
}

/**
 * Runs a proposal the user CONFIRMED in the panel. Every branch goes through the
 * existing write path (verdicts and checks through the content actions, so the
 * reviewer gate, dual approval, claims, live webhook and audit all apply).
 */
type ExecResult = { ok: true; message: string; href?: string; state?: string } | { error: string };

/** The item's stage after a write, for the panel's "new state" line. */
async function withState(r: ExecResult, itemId: number): Promise<ExecResult> {
  if ("error" in r) return r;
  // Runs after the write: must never throw, or the caller would release a card that did run.
  const it = await db.contentItem.findFirst({ where: { id: itemId, tenantId: TENANT_ID }, select: { status: true } }).catch(() => null);
  return it ? { ...r, state: STATUS_LABELS[it.status as ContentStatus] ?? it.status } : r;
}

/**
 * Runs a card the user CONFIRMED. With `ref` (a card stored in one of the user's
 * conversations) the STORED proposal runs, not the client copy, and the card is stamped
 * `executedAt` so a reload or a second click cannot run it twice.
 */
export async function executeAction(raw: ActionProposal, ref?: { conversationId: number; key: string }): Promise<ExecResult> {
  const { userId } = await getActor(TENANT_ID);
  if (userId == null) return { error: NOT_A_CRM_USER };
  if (ref === undefined) return runAction(userId, raw);
  if (!validId(ref?.conversationId) || typeof ref.key !== "string" || ref.key.length > 40) return { error: BAD_INPUT };
  const conv = await db.assistantConversation.findFirst({ where: ownConv(userId, ref.conversationId), select: { messages: true, updatedAt: true } });
  const turns = Array.isArray(conv?.messages) ? (conv!.messages as ChatTurn[]) : [];
  const card = turns.flatMap((t) => (t.role === "assistant" ? t.actions : [])).find((a) => a.key === ref.key);
  if (!card) return { error: NOT_FOUND };
  if (card.executedAt) return { error: "Ezt már végrehajtotta." };
  // Claim first (optimistic on updatedAt), then run: two quick clicks cannot both pass.
  const at = new Date().toISOString();
  const stamped = turns.map((t) => (t.role === "assistant" ? { ...t, actions: t.actions.map((a) => (a.key === ref.key ? { ...a, executedAt: at } : a)) } : t));
  const claim = await db.assistantConversation.updateMany({
    where: { ...ownConv(userId, ref.conversationId), updatedAt: conv!.updatedAt },
    data: { messages: stamped, updatedAt: new Date() },
  });
  if (claim.count === 0) return { error: "A beszélgetés közben változott. Kérem, próbálja újra." };
  // Not executed (error result or a throw before the write): release the stamp so the user can retry.
  const release = async () => {
    const cur = await db.assistantConversation.findFirst({ where: ownConv(userId, ref.conversationId), select: { messages: true } });
    const back = (Array.isArray(cur?.messages) ? (cur!.messages as ChatTurn[]) : []).map((t) => (t.role === "assistant" ? { ...t, actions: t.actions.map((a) => (a.key === ref.key ? { ...a, executedAt: undefined } : a)) } : t));
    await db.assistantConversation.updateMany({ where: ownConv(userId, ref.conversationId), data: { messages: back } });
  };
  let r: ExecResult;
  try {
    r = await runAction(userId, card.proposal);
  } catch (e) {
    await release().catch(() => {});
    throw e;
  }
  if ("error" in r) await release();
  return r;
}

async function runAction(userId: number, raw: ActionProposal): Promise<ExecResult> {
  const parsed = ActionProposalSchema.safeParse(raw);
  // Client-side actions (open, navigate, waiting) never reach the server.
  if (!parsed.success || parsed.data.type === "none" || (CLIENT_ACTIONS as readonly string[]).includes(parsed.data.type)) return { error: BAD_INPUT };
  const p = parsed.data;

  if (p.type === "review") {
    // The version the user confirmed: a newer one landing since makes the service answer 409.
    if (p.versionId == null) return { error: BAD_INPUT };
    const v = await db.contentVersion.findFirst({ where: { id: p.versionId, itemId: p.itemId, tenantId: TENANT_ID }, select: { id: true } });
    if (!v) return { error: NOT_FOUND };
    const r = await submitContentReview({ versionId: p.versionId, verdict: p.verdict, comment: p.comment, reason: p.reason });
    if (!r.ok) return { error: r.error };
    await logExecuted(userId, "review", p.itemId);
    return withState({ ok: true, message: r.wentLive ? "Rögzítve, az anyag élesbe került." : "Rögzítve.", href: `/marketing/${p.itemId}` }, p.itemId);
  }
  if (p.type === "answer_decision") {
    const c = await db.contentCheck.findFirst({ where: { id: p.checkId, tenantId: TENANT_ID, state: "open" }, select: { itemId: true } });
    if (!c) return { error: NOT_FOUND };
    const r = await setContentCheck({ checkId: p.checkId, state: "resolved", text: p.answer });
    if (!r.ok) return { error: r.error };
    await logExecuted(userId, "answer_decision", c.itemId);
    return withState({ ok: true, message: "A válasz rögzítve.", href: `/marketing/${c.itemId}` }, c.itemId);
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
      const k = await addChecks(actor, c.itemId, [{ question: p.question, forWhom: p.decidedBy, source: "decision" }], tx);
      if (!k.ok) throw new CheckFail(k.error);
      return c;
    }).catch((e: unknown) => {
      if (e instanceof CheckFail) return { ok: false as const, error: e.message };
      reportError("assistant.create_decision", e, { userId });
      return { ok: false as const, error: MODEL_FAILED_WRITE };
    });
    if (!created.ok) return { error: created.error };
    await logExecuted(userId, "create_decision", created.itemId);
    revalidatePath("/marketing");
    revalidatePath("/marketing/decisions");
    return withState({ ok: true, message: "A döntés felkerült a Döntések oldalra.", href: `/marketing/${created.itemId}` }, created.itemId);
  }
  if (p.type === "note") {
    const r = await addItemNote({ itemId: p.itemId, body: p.body });
    if ("error" in r) return r;
    await logExecuted(userId, "note", p.itemId);
    return { ok: true, message: "Jegyzet mentve.", href: `/marketing/${p.itemId}` };
  }
  if (p.type !== "ticket") return { error: BAD_INPUT };
  const r = await fileTicket(p.draft);
  if ("error" in r) return r;
  await logExecuted(userId, "ticket", null);
  return "url" in r ? { ok: true, message: "Hibajegy létrehozva.", href: r.url } : { ok: true, message: "Nyissa meg a kitöltött jegyet:", href: r.fallbackUrl };
}
