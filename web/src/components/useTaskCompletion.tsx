"use client";

import { useState, useCallback, startTransition } from "react";
import { useRouter } from "next/navigation";
import { completeTask } from "@/app/actions/tasks";
import {
  completionPromptsFor,
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

// Which prompt(s) a completed task raises, and in what order, is one rule,
// `completionPromptsFor` in lib/interactions.ts, so the two surfaces that tick
// tasks (this hook, and the Kanban's drag-to-done) cannot drift. A lead-linked
// `call` gets the stage prompt only: the lead's own "Hívás eredménye" modal
// (reached from there) is the richer way to log that call, so a second,
// generic log modal would be redundant. Every other lead-linked, loggable
// type (email, meeting, field_visit) has no such richer path, so it gets the
// log modal first and the stage modal after, one at a time, never stacked.

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
  // Set when the log modal must be followed by the stage modal (see
  // completionPromptsFor's ["log", "stage"] case) — read by the log modal's
  // onClose so the two never stack.
  const [pendingStageTaskId, setPendingStageTaskId] = useState<number | null>(null);

  const raisePrompts = useCallback((task: CompletableTask) => {
    const prompts = completionPromptsFor(task);
    if (prompts[0] === "log") {
      setLogTask(task);
      setPendingStageTaskId(prompts[1] === "stage" ? task.id : null);
    } else if (prompts[0] === "stage") {
      setStageTaskId(task.id);
    }
  }, []);

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
      raisePrompts(task);
    },
    [router, raisePrompts],
  );

  /**
   * Surface the log-interaction and/or stage prompt without completing the
   * task — for surfaces that mark a task done through another path (e.g.
   * Kanban drag-to-done via `moveTask`). No-op for a task that raises neither.
   */
  const promptLog = useCallback(
    (task: CompletableTask) => raisePrompts(task),
    [raisePrompts],
  );

  // Stable identity: LeadStagePromptModal has this in an effect dependency list,
  // and a fresh closure each render would re-fire the server action forever.
  const closeStage = useCallback(() => setStageTaskId(null), []);

  const closeLog = useCallback(() => {
    setLogTask(null);
    // The log modal just closed; if it was followed by a stage prompt, open it
    // now, sequential rather than stacked.
    setPendingStageTaskId((pendingId) => {
      if (pendingId !== null) setStageTaskId(pendingId);
      return null;
    });
  }, []);

  const stageModal = stageTaskId !== null ? (
    <LeadStagePromptModal key={stageTaskId} taskId={stageTaskId} onClose={closeStage} />
  ) : null;

  const logModal = logTask ? (
    <LogInteractionModal
      key={logTask.id}
      open
      onClose={closeLog}
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
