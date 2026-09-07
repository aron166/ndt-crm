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
