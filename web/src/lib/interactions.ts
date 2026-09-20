export const INTERACTION_TYPE_LABEL: Record<string, string> = {
  call: "Telefonhívás",
  email: "Email",
  meeting: "Találkozó",
  site_visit: "Helyszíni látogatás",
  note: "Megjegyzés",
};

export const INTERACTION_DIRECTION_LABEL: Record<string, string> = {
  outbound: "Kimenő",
  inbound: "Bejövő",
};

export function interactionTypeLabel(type: string | null): string {
  if (!type) return "Ismeretlen";
  return INTERACTION_TYPE_LABEL[type] ?? type;
}

export function interactionDirectionLabel(direction: string | null): string {
  if (!direction) return "";
  return INTERACTION_DIRECTION_LABEL[direction] ?? direction;
}

// Task types (call/email/meeting/field_visit/document/internal) that, on
// completion, correspond to a loggable interaction. Maps the task type to the
// interaction type used by LogInteractionModal. Non-communication task types
// (document, internal) intentionally have no mapping → no prompt.
export const TASK_TYPE_TO_INTERACTION_TYPE: Record<string, string> = {
  call: "call",
  email: "email",
  meeting: "meeting",
  field_visit: "site_visit",
};

export function taskTypeToInteractionType(taskType: string | null): string | null {
  if (!taskType) return null;
  return TASK_TYPE_TO_INTERACTION_TYPE[taskType] ?? null;
}

/**
 * After completing a task, should we offer to log an interaction?
 * Only for communication-type tasks that are tied to a company or person
 * (an interaction needs a subject to attach to).
 */
export function shouldLogInteractionOnComplete(task: {
  type: string | null;
  companyId: number | null;
  personId: number | null;
}): boolean {
  return (
    taskTypeToInteractionType(task.type) !== null &&
    (task.companyId != null || task.personId != null)
  );
}

/**
 * After completing a task, must we ASK which stage the lead is in now?
 *
 * Péter's rule (BRIEFING addendum 2026-09-07 P0 #4, restated as BACKLOG item 6
 * / raw42 #3): ticking a task off must never advance the card by itself, it is
 * ambiguous, so it asks. Nothing in the code advances a lead when a task is
 * completed, and that stays true; this decides where the QUESTION appears.
 *
 * Any task that serves a lead qualifies, not just call tasks. The case that
 * was missing: `logLeadCallOutcome` creates the demo booking as a `meeting`
 * task, and the demo happening is exactly the moment the card should move.
 * Ticking it off asked nothing, so the lead sat in `demo_aron` forever.
 *
 * A task with no lead has no stage to ask about, and falls through to
 * `shouldLogInteractionOnComplete` instead.
 */
export function shouldPromptLeadStageOnComplete(task: { leadId?: number | null }): boolean {
  return task.leadId != null;
}

export type CompletionPrompt = "log" | "stage";

/**
 * Which prompt(s) a completed task raises, in order, per the completion
 * behaviour table (see the comment above useTaskCompletion). A lead-linked
 * `call` skips the log prompt outright, because the lead's own "Hívás
 * eredménye" modal (opened from the stage prompt) is the richer place to log
 * that call. Every other lead-linked, loggable type has no such richer path,
 * so it gets the log prompt first, then the stage prompt, sequential rather
 * than stacked. A task with no lead falls back to the plain log-or-nothing
 * rule.
 */
export function completionPromptsFor(task: {
  type: string | null;
  companyId: number | null;
  personId: number | null;
  leadId?: number | null;
}): CompletionPrompt[] {
  const loggable = shouldLogInteractionOnComplete(task);
  if (shouldPromptLeadStageOnComplete(task)) {
    if (loggable && task.type !== "call") return ["log", "stage"];
    return ["stage"];
  }
  return loggable ? ["log"] : [];
}

export interface LogInteractionInput {
  type?: string;
  notes?: string;
  occurredAt?: string;
  direction?: string;
  outcome?: string;
  companyId?: number | null;
  personId?: number | null;
}

export function validateInteractionInput(input: LogInteractionInput): string | null {
  if (!input.type?.trim()) return "Típus kötelező";
  if (!input.notes?.trim()) return "Megjegyzés kötelező";
  if (!input.occurredAt) return "Dátum kötelező";
  return null;
}
