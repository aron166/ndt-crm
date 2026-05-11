import { Prisma } from '@prisma/client';

/**
 * Tasks are atomic — "write email" and "send email" are two separate tasks.
 * Everything in the system hangs off tasks.
 *
 * status flow: not_started → in_progress → done | cancelled
 * completedAt is set automatically when status transitions to "done".
 */

export const taskInclude = {
  subTasks: {
    select: {
      id: true,
      title: true,
      status: true,
      dueDate: true,
      estimatedMinutes: true,
      actualMinutes: true,
    },
  },
  assignedTo: { select: { id: true, name: true, email: true } },
} satisfies Prisma.TaskInclude;

/** Single task with its direct subtasks and assignee */
export type TaskWithRelations = Prisma.TaskGetPayload<{
  include: typeof taskInclude;
}>;

/** Time efficiency summary for a task */
export interface TimeDiff {
  taskId: number;
  estimatedMinutes: number | null;
  actualMinutes: number | null;
  /** actual - estimated, null if either is missing */
  diffMinutes: number | null;
  /** (actual / estimated - 1) * 100, null if either is missing */
  diffPercent: number | null;
}
