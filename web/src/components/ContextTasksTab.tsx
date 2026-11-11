"use client";

import { useState, startTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, CheckCircle2, PencilLine } from "lucide-react";
import { TaskModal } from "@/app/(app)/tasks/TaskModal";
import { TaskStatusBadge } from "@/components/TaskStatusBadge";
import { reopenTask } from "@/app/actions/tasks";
import { useTaskCompletion } from "@/components/useTaskCompletion";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Task {
  id: number;
  title: string;
  type: string | null;
  status: string;
  dueDate: string | Date | null;
  estimatedMinutes: number | null;
  description: string | null;
  category: string | null;
  companyId: number | null;
  personId: number | null;
  leadId: number | null;
  parentTaskId: number | null;
  costCode: string | null;
  costQuantity: number | null;
  costUnit: string | null;
  costUnitRate: number | null;
  _count: { subTasks: number };
}

interface ContextTasksTabProps {
  tasks: Task[];
  companyId?: number;
  companyName?: string;
  personId?: number;
  personName?: string;
}

function isOverdue(dueDate: string | Date | null, status: string) {
  if (!dueDate || status === "done" || status === "cancelled") return false;
  return new Date(dueDate) < new Date(new Date().toDateString());
}

export function ContextTasksTab({
  tasks,
  companyId,
  companyName,
  personId,
  personName,
}: ContextTasksTabProps) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const { complete, logModal } = useTaskCompletion();

  async function handleComplete(task: Task) {
    await complete({
      id: task.id,
      type: task.type,
      companyId: task.companyId ?? companyId ?? null,
      personId: task.personId ?? personId ?? null,
      leadId: task.leadId,
      companyName,
      personName,
    });
  }

  function handleReopen(id: number) {
    startTransition(async () => {
      await reopenTask(id);
      router.refresh();
    });
  }

  const open = tasks.filter((t) => t.status !== "done" && t.status !== "cancelled");
  const done = tasks.filter((t) => t.status === "done" || t.status === "cancelled");

  return (
    <>
      <TaskModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditTask(null); router.refresh(); }}
        initial={
          editTask
            ? {
                id: editTask.id,
                title: editTask.title,
                type: editTask.type,
                status: editTask.status,
                dueDate: editTask.dueDate instanceof Date ? editTask.dueDate.toISOString() : editTask.dueDate ?? undefined,
                estimatedMinutes: editTask.estimatedMinutes,
                description: editTask.description,
                companyId: editTask.companyId,
                companyName,
                personId: editTask.personId,
                personName,
                costCode: editTask.costCode,
                costQuantity: editTask.costQuantity,
                costUnit: editTask.costUnit,
                costUnitRate: editTask.costUnitRate,
              }
            : {
                companyId: companyId ?? null,
                companyName,
                personId: personId ?? null,
                personName,
              }
        }
      />
      {logModal}

      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-[var(--ui-text-muted)]">
          {open.length} nyitott{done.length > 0 && ` · ${done.length} kész`}
        </p>
        <Button type="button" size="sm" onClick={() => { setEditTask(null); setModalOpen(true); }}>
          <Plus className="size-3.5" />
          Feladat
        </Button>
      </div>

      {tasks.length === 0 ? (
        <p className="text-sm text-[var(--ui-text-muted)] py-6 text-center">
          Nincs feladat. Hozz létre egyet a Feladat gombbal.
        </p>
      ) : (
        <div className="bg-[var(--ui-surface)] rounded-[var(--ui-radius-surface)] shadow-[var(--ui-shadow-raised)] overflow-hidden">
          <table className="w-full text-sm">
            <tbody>
              {[...open, ...done].map((t) => {
                const overdue = isOverdue(t.dueDate, t.status);
                return (
                  <tr
                    key={t.id}
                    className={cn(
                      "border-b border-[var(--ui-border)] last:border-0 hover:bg-[var(--ui-hover)] transition-colors",
                      t.status === "done" && "opacity-60"
                    )}
                  >
                    <td className="px-3 py-2.5 w-8">
                      {t.status !== "done" ? (
                        <button
                          type="button"
                          onClick={() => handleComplete(t)}
                          className="w-4.5 h-4.5 rounded-full border-2 border-[var(--ui-border-strong)] hover:border-[var(--ui-success)] transition-colors"
                          title="Kész"
                          aria-label="Kész"
                        />
                      ) : (
                        <Button type="button" variant="ghost" size="icon-xs" className="size-6 min-h-6" onClick={() => handleReopen(t.id)} title="Újranyitás" aria-label="Újranyitás">
                          <CheckCircle2 className="size-4 text-[var(--ui-success-text)]" />
                        </Button>
                      )}
                    </td>
                    <td className="px-2 py-2.5 flex-1">
                      <Link
                        href={`/tasks/${t.id}`}
                        className={cn(
                          "hover:text-[var(--ui-text-link)] transition-colors",
                          t.status === "done" ? "line-through text-[var(--ui-text-muted)]" : "text-[var(--ui-text)]"
                        )}
                      >
                        {t.title}
                      </Link>
                      {t._count.subTasks > 0 && (
                        <span className="ml-2 text-xs text-[var(--ui-text-muted)]">
                          {t._count.subTasks} alfeladat
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2.5 hidden sm:table-cell">
                      <span className={cn("text-xs", overdue ? "text-[var(--ui-danger-text)] font-semibold" : "text-[var(--ui-text-muted)]")}>
                        {t.dueDate ? formatDate(t.dueDate) : ""}
                        {overdue && " Lejárt"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <TaskStatusBadge status={t.status} />
                    </td>
                    <td className="px-3 py-2.5 w-8">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className="size-6 min-h-6"
                        onClick={() => { setEditTask(t); setModalOpen(true); }}
                        title="Szerkesztés"
                        aria-label="Szerkesztés"
                      >
                        <PencilLine size={14} aria-hidden="true" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
