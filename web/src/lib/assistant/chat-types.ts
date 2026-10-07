// Assistant v3 shared contract (client + server). Types only, no runtime imports.
import type { ActionProposal } from "./actions";

/** One stored turn. Assistant turns carry the validated actions they proposed. */
export type ChatTurn =
  | { role: "user"; content: string; at: string }
  | { role: "assistant"; content: string; actions: ActionCard[]; at: string };

/** A validated, server-enriched action the panel renders as a card with "Végrehajtom". */
export type ActionCard = { key: string; summary: string; proposal: ActionProposal };

export type ConversationSummary = { id: number; title: string; updatedAt: string };
export type ConversationView = ConversationSummary & { page: string; itemId: number | null; messages: ChatTurn[] };

/** POST /api/assistant/chat body. conversationId null = start a new conversation. */
export type ChatRequest = { conversationId: number | null; pathname: string; itemId: number | null; message: string };

/**
 * SSE events from POST /api/assistant/chat (text/event-stream, `event: <type>\ndata: <json>\n\n`):
 *   start  { conversationId }               conversation row exists (new or existing)
 *   status { text }                         e.g. "Megnyitom: #12" while the read tool runs
 *   delta  { text }                         next piece of the answer text
 *   done   { answer, actions: ActionCard[] } final, validated; the turn is persisted
 *   error  { message }                      Hungarian, user-facing; the stream ends
 */
export type ChatEvent =
  | { type: "start"; conversationId: number }
  | { type: "status"; text: string }
  | { type: "delta"; text: string }
  | { type: "done"; answer: string; actions: ActionCard[] }
  | { type: "error"; message: string };

export const MAX_CONVERSATION_TURNS = 40;
export const RECENT_CONVERSATIONS = 20;
