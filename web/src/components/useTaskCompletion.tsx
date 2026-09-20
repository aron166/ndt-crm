"use client";

import { useState, useCallback, startTransition } from "react";
import { useRouter } from "next/navigation";
import { completeTask } from "@/app/actions/tasks";
import {
  shouldLogInteractionOnComplete,
  shouldPromptLeadStageOnComplete,
  taskTypeToInteractionType,
} from "@/lib/interactions";
import { LogInteractionModal } from "./LogInteractionModal";
import { LeadStagePromptModal } from "./LeadStagePromptModal";

export interface CompletableTask {
  id: number;
  type: string | null;
  companyId: number | null;
  personId: number | null;
  /** Set when the task serves a lead (e.g. a callback) — drives the stage prompt. */
  leadId?: number | null;
  companyName?: string;
  personName?: string;
}

// Which prompt a completed task raises is one rule, in lib/interactions.ts, so
// the two surfaces that tick tasks (this hook, and the Kanban's drag-to-done)
// cannot drift. The lead-stage question takes precedence over the
// log-interaction prompt: the lead's own "Hívás eredménye" modal is the richer
// way to log that call, and two stacked dialogs on one click is worse than
// either.

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
  const [stageTaskId, setStageTaskId] = useState<number | null>(null);

  const complete = useCallback(
    async (task: CompletableTask) => {
      const res = await completeTask(task.id);
      // A denied action wrote nothing, so there is nothing to prompt about.
      // Without this the stage dialog opened over an untouched task and its
      // "Áthelyezés" would have been the only thing that took effect.
      if (res && "error" in res) return res;
      // The refresh is a full RSC round trip. Outside a transition it blocked the
      // click that ticked the task off, and delayed the follow-up modal behind it.
      // The task IS done before the modal opens either way - only the re-render moves.
      startTransition(() => router.refresh());
      if (shouldPromptLeadStageOnComplete(task)) {
        setStageTaskId(task.id);
      } else if (shouldLogInteractionOnComplete(task)) {
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
    if (shouldPromptLeadStageOnComplete(task)) {
      setStageTaskId(task.id);
    } else if (shouldLogInteractionOnComplete(task)) {
      setLogTask(task);
    }
  }, []);

  // Stable identity: LeadStagePromptModal has this in an effect dependency list,
  // and a fresh closure each render would re-fire the server action forever.
  const closeStage = useCallback(() => setStageTaskId(null), []);

  const stageModal = stageTaskId !== null ? (
    <LeadStagePromptModal key={stageTaskId} taskId={stageTaskId} onClose={closeStage} />
  ) : null;

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

  // One `logModal` node keeps every existing call site unchanged — it now carries
  // whichever prompt applies.
  return { complete, promptLog, logModal: <>{logModal}{stageModal}</> };
}
