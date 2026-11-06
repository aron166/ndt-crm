// Single task status vocabulary (schema: created, in_progress, done, cancelled). No imports: client-safe.
export const TASK_STATUSES = ["created", "in_progress", "done", "cancelled"] as const;
export const OPEN_TASK_STATUSES = ["created", "in_progress"] as const;
export const CLOSED_TASK_STATUSES = ["done", "cancelled"] as const;

export function isClosedTaskStatus(status: string): boolean {
  return (CLOSED_TASK_STATUSES as readonly string[]).includes(status);
}
