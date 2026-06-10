"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, CheckCircle2 } from "lucide-react";
import { TaskModal } from "@/app/(app)/tasks/TaskModal";
import { TaskStatusBadge } from "@/components/TaskStatusBadge";
import { completeTask, reopenTask } from "@/app/actions/tasks";
import { formatDate } from "@/lib/utils";
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

  async function handleComplete(id: number) {
    await completeTask(id);
    router.refresh();
  }

  async function handleReopen(id: number) {
    await reopenTask(id);
    router.refresh();
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

      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-slate-500">
          {open.length} nyitott{done.length > 0 && ` · ${done.length} kész`}
        </p>
        <button
          onClick={() => { setEditTask(null); setModalOpen(true); }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium transition-colors"
        >
          <Plus className="size-3.5" />
          Feladat
        </button>
      </div>

      {tasks.length === 0 ? (
        <p className="text-sm text-slate-400 py-6 text-center">
          Nincs feladat. Hozz létre egyet a Feladat gombbal.
        </p>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <tbody>
              {[...open, ...done].map((t) => {
                const overdue = isOverdue(t.dueDate, t.status);
                return (
                  <tr
                    key={t.id}
                    className={cn(
                      "border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors",
                      t.status === "done" && "opacity-60"
                    )}
                  >
                    <td className="px-3 py-2.5 w-8">
                      {t.status !== "done" ? (
                        <button
                          onClick={() => handleComplete(t.id)}
                          className="w-4.5 h-4.5 rounded-full border-2 border-slate-300 hover:border-green-500 transition-colors"
                          title="Kész"
                        />
                      ) : (
                        <button onClick={() => handleReopen(t.id)} title="Újranyitás">
                          <CheckCircle2 className="size-4 text-green-500" />
                        </button>
                      )}
                    </td>
                    <td className="px-2 py-2.5 flex-1">
                      <Link
                        href={`/tasks/${t.id}`}
                        className={cn(
                          "hover:text-indigo-600 transition-colors",
                          t.status === "done" ? "line-through text-slate-400" : "text-slate-900"
                        )}
                      >
                        {t.title}
                      </Link>
                      {t._count.subTasks > 0 && (
                        <span className="ml-2 text-xs text-slate-400">
                          {t._count.subTasks} alfeladat
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2.5 hidden sm:table-cell">
                      <span className={cn("text-xs", overdue ? "text-red-600 font-semibold" : "text-slate-400")}>
                        {t.dueDate ? formatDate(t.dueDate) : ""}
                        {overdue && " ⚠"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <TaskStatusBadge status={t.status} />
                    </td>
                    <td className="px-3 py-2.5 w-8">
                      <button
                        onClick={() => { setEditTask(t); setModalOpen(true); }}
                        className="text-xs text-slate-400 hover:text-slate-700"
                        title="Szerkesztés"
                      >
                        ✏️
                      </button>
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
