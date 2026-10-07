"use server";
// Hungarian copy is PROPOSAL until Áron approves.

import { db } from "@/lib/db";
import { getActor, NOT_A_CRM_USER } from "@/lib/actor";
import { getContentReviewers } from "@/lib/content/reviewers";
import { assistantConfig, chatCompletion, estimateCostUsd, type ChatMessage } from "@/lib/assistant/provider";
import { CAP_EXCEEDED, capState } from "@/lib/assistant/cap";
import { buildSystemPrompt, loadItemContext, pageKind, type ItemContext } from "@/lib/assistant/context";
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
  if (!Array.isArray(m) || m.length < 1 || m.length > 40 || m[m.length - 1].role !== "user") return BAD_INPUT;
  for (const x of m) {
    if ((x?.role !== "user" && x?.role !== "assistant") || typeof x.content !== "string" || x.content.length < 1 || x.content.length > 2000) return BAD_INPUT;
  }
  if (m.filter((x) => x.role === "user").length > 20) return TOO_LONG;
  return null;
}

const noteView = (n: { id: number; body: string; createdAt: Date; user: { name: string | null } | null }): NoteView => ({
  id: n.id, body: n.body, author: n.user?.name ?? "", createdAt: n.createdAt.toISOString(),
});

/** Shared by askAssistant and draftTicket: validate, cap, call, log. */
async function run(userId: number, input: AssistantInput, purpose: "explain" | "ticket"): Promise<{ text: string } | { error: string }> {
  const bad = checkInput(input);
  if (bad) return { error: bad };
  const cfg = assistantConfig();
  if (!cfg) return { error: NOT_CONFIGURED };

  let item: ItemContext | null = null;
  if (input.itemId !== null) {
    item = await loadItemContext(TENANT_ID, input.itemId);
    if (!item) return { error: NOT_FOUND };
  }
  if ((await capState(TENANT_ID)).exceeded) return { error: CAP_EXCEEDED };

  const [user, reviewers] = await Promise.all([
    db.user.findFirst({ where: { id: userId, tenantId: TENANT_ID }, select: { role: true, name: true } }),
    getContentReviewers(TENANT_ID),
  ]);
  const messages: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt({ pathname: input.pathname, item, role: user?.role ?? "user", isReviewer: reviewers.includes(userId) }) },
    ...(purpose === "ticket" ? [{ role: "system", content: TICKET_INSTRUCTION } as ChatMessage] : []),
    ...input.messages,
  ];

  let r;
  try {
    r = await chatCompletion(cfg, messages, purpose === "ticket" ? { json: true, maxTokens: 700 } : {});
  } catch {
    return { error: MODEL_FAILED };
  }
  await db.assistantCall.create({
    data: {
      tenantId: TENANT_ID, userId, page: input.pathname, purpose, itemId: input.itemId, model: cfg.model,
      promptTokens: r.promptTokens, completionTokens: r.completionTokens,
      costUsd: estimateCostUsd(r.promptTokens, r.completionTokens),
    },
  });
  return { text: r.text };
}

export async function openAssistant(input: { itemId: number | null }): Promise<{ ok: true; configured: boolean; item: { id: number; title: string } | null; notes: NoteView[] } | { error: string }> {
  const { userId } = await getActor(TENANT_ID);
  if (userId == null) return { error: NOT_A_CRM_USER };
  if (input?.itemId !== null && !validId(input?.itemId)) return { error: BAD_INPUT };

  let item: { id: number; title: string } | null = null;
  let notes: NoteView[] = [];
  if (input.itemId !== null) {
    const ctx = await loadItemContext(TENANT_ID, input.itemId);
    if (!ctx) return { error: NOT_FOUND };
    item = { id: ctx.id, title: ctx.title };
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
