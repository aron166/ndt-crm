"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { completeTask } from "@/app/actions/tasks";
import {
  shouldLogInteractionOnComplete,
  taskTypeToInteractionType,
} from "@/lib/interactions";
import { LogInteractionModal } from "./LogInteractionModal";

export interface CompletableTask {
  id: number;
  type: string | null;
  companyId: number | null;
  personId: number | null;
  companyName?: string;
  personName?: string;
}

/**
 * Completing a communication-type task (call/email/meeting/field_visit) tied to
 * a company or person should let you log the interaction outcome in the same
 * step — the highest-frequency daily action. This hook wraps `completeTask` and,
 * when appropriate, surfaces a pre-filled LogInteractionModal.
 *
 * Usage:
 *   const { complete, logModal } = useTaskCompletion();
 *   <button onClick={() => complete(task)} /> ... {logModal}
 *
 * `complete` resolves once the task is marked done (the interaction log is
 * optional — cancelling the modal leaves the task completed).
 */
export function useTaskCompletion() {
  const router = useRouter();
  const [logTask, setLogTask] = useState<CompletableTask | null>(null);

  const complete = useCallback(
    async (task: CompletableTask) => {
      await completeTask(task.id);
      router.refresh();
      if (shouldLogInteractionOnComplete(task)) {
        setLogTask(task);
      }
    },
    [router],
  );

  /**
   * Surface the log-interaction prompt without completing the task — for
   * surfaces that mark a task done through another path (e.g. Kanban
   * drag-to-done via `moveTask`). No-op for non-interaction tasks.
   */
  const promptLog = useCallback((task: CompletableTask) => {
    if (shouldLogInteractionOnComplete(task)) {
      setLogTask(task);
    }
  }, []);

  const logModal = logTask ? (
    <LogInteractionModal
      key={logTask.id}
      open
      onClose={() => setLogTask(null)}
      companyId={logTask.companyId}
      personId={logTask.personId}
      companyName={logTask.companyName}
      personName={logTask.personName}
      defaultType={taskTypeToInteractionType(logTask.type) ?? undefined}
    />
  ) : null;

  return { complete, promptLog, logModal };
}
