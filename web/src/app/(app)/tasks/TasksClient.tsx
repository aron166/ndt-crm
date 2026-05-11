"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TaskModal } from "./TaskModal";
import { TaskStatusBadge } from "@/components/TaskStatusBadge";
import { completeTask, reopenTask, deleteTask } from "@/app/actions/tasks";
import { formatDate } from "@/lib/utils";
import { CheckCircle2, RotateCcw, Pencil, Trash2, Plus } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface Task {
  id: number;
  title: string;
  type: string | null;
  category: string | null;
  status: string;
  dueDate: Date | null;
  estimatedMinutes: number | null;
  description: string | null;
  companyId: number | null;
  personId: number | null;
  parentTaskId: number | null;
  company: { id: number; name: string } | null;
  person: { id: number; firstName: string | null; lastName: string | null } | null;
  _count: { subTasks: number };
}

interface TasksClientProps {
  tasks: Task[];
}

function isOverdue(dueDate: Date | null, status: string) {
  if (!dueDate || status === "done" || status === "cancelled") return false;
  return new Date(dueDate) < new Date(new Date().toDateString());
}

function isToday(dueDate: Date | null) {
  if (!dueDate) return false;
  const d = new Date(dueDate);
  const today = new Date();
  return (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  );
}

export function TasksClient({ tasks }: TasksClientProps) {
  const router = useRouter();
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  async function handleComplete(id: number) {
    await completeTask(id);
    router.refresh();
  }

  async function handleReopen(id: number) {
    await reopenTask(id);
    router.refresh();
  }

  async function handleDelete(id: number) {
    if (!confirm("Biztosan törlöd ezt a feladatot?")) return;
    await deleteTask(id);
    router.refresh();
  }

  return (
    <>
      <TaskModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditTask(null);
          router.refresh();
        }}
        initial={
          editTask
            ? {
                id: editTask.id,
                title: editTask.title,
                type: editTask.type,
                category: editTask.category,
                status: editTask.status,
                dueDate: editTask.dueDate?.toISOString(),
                estimatedMinutes: editTask.estimatedMinutes,
                description: editTask.description,
                companyId: editTask.companyId ?? undefined,
                personId: editTask.personId ?? undefined,
              }
            : undefined
        }
      />

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="w-8 px-3 py-3" />
              <th className="text-left px-4 py-3 font-medium text-slate-500">
                Feladat
              </th>
              <th className="text-left px-4 py-3 font-medium text-slate-500 hidden md:table-cell">
                Típus
              </th>
              <th className="text-left px-4 py-3 font-medium text-slate-500 hidden lg:table-cell">
                Határidő
              </th>
              <th className="text-left px-4 py-3 font-medium text-slate-500 hidden lg:table-cell">
                Cég / Személy
              </th>
              <th className="text-left px-4 py-3 font-medium text-slate-500">
                Státusz
              </th>
              <th className="px-4 py-3 w-24" />
            </tr>
          </thead>
          <tbody>
            {tasks.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-12 text-center text-slate-400"
                >
                  Nincs feladat ebben a nézetben.
                </td>
              </tr>
            )}
            {tasks.map((t) => {
              const overdue = isOverdue(t.dueDate, t.status);
              const today = isToday(t.dueDate);
              return (
                <tr
                  key={t.id}
                  className={cn(
                    "border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors",
                    t.status === "done" && "opacity-60"
                  )}
                >
                  <td className="px-3 py-3">
                    {t.status !== "done" ? (
                      <button
                        onClick={() => handleComplete(t.id)}
                        className="w-5 h-5 rounded-full border-2 border-slate-300 hover:border-green-500 hover:bg-green-50 transition-colors flex items-center justify-center"
                        title="Kész"
                      />
                    ) : (
                      <CheckCircle2 className="size-5 text-green-500" />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/tasks/${t.id}`}
                      className={cn(
                        "font-medium hover:text-indigo-600 transition-colors",
                        t.status === "done"
                          ? "line-through text-slate-400"
                          : "text-slate-900"
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
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="text-xs text-slate-500 capitalize">
                      {(t.type ?? "").replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <span
                      className={cn(
                        "text-xs",
                        overdue
                          ? "text-red-600 font-semibold"
                          : today
                            ? "text-amber-600 font-semibold"
                            : "text-slate-500"
                      )}
                    >
                      {t.dueDate ? formatDate(t.dueDate) : "—"}
                      {overdue && " ⚠"}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-xs text-slate-500">
                    {t.company && (
                      <Link
                        href={`/companies/${t.company.id}`}
                        className="hover:text-indigo-600"
                      >
                        {t.company.name}
                      </Link>
                    )}
                    {t.person && (
                      <span>
                        {t.company && " · "}
                        <Link
                          href={`/persons/${t.person.id}`}
                          className="hover:text-indigo-600"
                        >
                          {t.person.lastName} {t.person.firstName}
                        </Link>
                      </span>
                    )}
                    {!t.company && !t.person && "—"}
                  </td>
                  <td className="px-4 py-3">
                    <TaskStatusBadge status={t.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={() => {
                          setEditTask(t);
                          setModalOpen(true);
                        }}
                        className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700"
                        title="Szerkesztés"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      {t.status === "done" && (
                        <button
                          onClick={() => handleReopen(t.id)}
                          className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700"
                          title="Újranyitás"
                        >
                          <RotateCcw className="size-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(t.id)}
                        className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-600"
                        title="Törlés"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
