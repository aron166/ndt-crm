"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, CheckCircle2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TaskModal } from "../TaskModal";
import { TaskStatusBadge } from "@/components/TaskStatusBadge";
import { completeTask, reopenTask } from "@/app/actions/tasks";
import { formatDate } from "@/lib/utils";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface SubTask {
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
  subTasks: SubTask[];
}

export function TaskDetailClient({ task }: { task: Task }) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [subTaskOpen, setSubTaskOpen] = useState(false);

  async function handleComplete(id: number) {
    await completeTask(id);
    router.refresh();
  }

  async function handleReopen(id: number) {
    await reopenTask(id);
    router.refresh();
  }

  return (
    <>
      <TaskModal
        open={editOpen}
        onClose={() => { setEditOpen(false); router.refresh(); }}
        initial={{
          id: task.id,
          title: task.title,
          type: task.type,
          category: task.category,
          status: task.status,
          dueDate: task.dueDate?.toISOString(),
          estimatedMinutes: task.estimatedMinutes,
          description: task.description,
          companyId: task.companyId ?? undefined,
          personId: task.personId ?? undefined,
        }}
      />
      <TaskModal
        open={subTaskOpen}
        onClose={() => { setSubTaskOpen(false); router.refresh(); }}
        initial={{ parentTaskId: task.id, companyId: task.companyId, personId: task.personId }}
      />

      <div className="flex items-center gap-2 mb-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setEditOpen(true)}
          className="gap-1.5"
        >
          <Pencil className="size-3.5" />
          Szerkesztés
        </Button>
        {task.status !== "done" ? (
          <Button
            size="sm"
            className="bg-green-600 hover:bg-green-700 text-white gap-1.5"
            onClick={() => handleComplete(task.id)}
          >
            <CheckCircle2 className="size-3.5" />
            Kész
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleReopen(task.id)}
          >
            Újranyitás
          </Button>
        )}
      </div>

      {task.subTasks.length > 0 || true ? (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <h2 className="text-sm font-medium text-slate-700">
              Alfeladatok ({task.subTasks.length})
            </h2>
            <button
              onClick={() => setSubTaskOpen(true)}
              className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700"
            >
              <Plus className="size-3.5" />
              Hozzáadás
            </button>
          </div>
          {task.subTasks.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-400">
              Nincsenek alfeladatok.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {task.subTasks.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
                  {s.status !== "done" ? (
                    <button
                      onClick={() => handleComplete(s.id)}
                      className="w-4 h-4 rounded-full border-2 border-slate-300 hover:border-green-500 shrink-0"
                    />
                  ) : (
                    <CheckCircle2 className="size-4 text-green-500 shrink-0" />
                  )}
                  <Link
                    href={`/tasks/${s.id}`}
                    className={cn(
                      "flex-1 text-sm hover:text-indigo-600",
                      s.status === "done" ? "line-through text-slate-400" : "text-slate-800"
                    )}
                  >
                    {s.title}
                  </Link>
                  {s.dueDate && (
                    <span className="text-xs text-slate-400 hidden sm:block">
                      {formatDate(s.dueDate)}
                    </span>
                  )}
                  <TaskStatusBadge status={s.status} />
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </>
  );
}
