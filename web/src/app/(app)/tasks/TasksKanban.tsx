"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Clock } from "lucide-react";
import { moveTask } from "@/app/actions/tasks";
import { TaskModal } from "./TaskModal";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

const COLUMNS = [
  { key: "created",     label: "Kiírva",       color: "#64748b", glow: "rgba(100,116,139,0.4)" },
  { key: "in_progress", label: "Folyamatban",  color: "#6366f1", glow: "rgba(99,102,241,0.4)"  },
  { key: "done",        label: "Elvégezve",    color: "#22c55e", glow: "rgba(34,197,94,0.4)"   },
  { key: "cancelled",   label: "Törölve",      color: "#f43f5e", glow: "rgba(244,63,94,0.4)"   },
] as const;

type Status = (typeof COLUMNS)[number]["key"];

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

interface TasksKanbanProps {
  tasks: Task[];
}

function isOverdue(dueDate: Date | null, status: string) {
  if (!dueDate || status === "done" || status === "cancelled") return false;
  return new Date(dueDate) < new Date(new Date().toDateString());
}

function KanbanCard({
  task,
  onDragStart,
  onDragEnd,
  dragging,
  onQuickCreate,
}: {
  task: Task;
  onDragStart: (id: number) => void;
  onDragEnd: () => void;
  dragging: boolean;
  onQuickCreate: (status: Status) => void;
}) {
  const overdue = isOverdue(task.dueDate, task.status);

  return (
    <div
      className={cn(
        "group rounded-lg border p-3 cursor-grab select-none transition-all duration-150",
        "bg-white border-slate-200 hover:border-indigo-300 hover:shadow-md hover:-translate-y-0.5",
        dragging && "opacity-40 cursor-grabbing"
      )}
      draggable
      onDragStart={() => onDragStart(task.id)}
      onDragEnd={onDragEnd}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="font-mono text-[10px] text-slate-400">#{task.id}</span>
        {task.type && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 capitalize">
            {task.type.replace("_", " ")}
          </span>
        )}
      </div>

      <p className={cn(
        "text-sm font-medium leading-snug",
        task.status === "done" ? "line-through text-slate-400" : "text-slate-900"
      )}>
        {task.title}
      </p>

      {task._count.subTasks > 0 && (
        <p className="text-[10px] text-slate-400 mt-1">
          {task._count.subTasks} alfeladat
        </p>
      )}

      <div className="flex items-center gap-2 mt-2.5 pt-2.5 border-t border-dashed border-slate-100 flex-wrap">
        {task.person && (
          <Link
            href={`/persons/${task.person.id}`}
            className="text-[11px] text-slate-500 hover:text-indigo-600 truncate max-w-[120px]"
            onClick={(e) => e.stopPropagation()}
          >
            {task.person.lastName} {task.person.firstName}
          </Link>
        )}
        {task.company && (
          <Link
            href={`/companies/${task.company.id}`}
            className="text-[11px] text-slate-400 hover:text-indigo-600 truncate max-w-[100px]"
            onClick={(e) => e.stopPropagation()}
          >
            {task.company.name}
          </Link>
        )}
      </div>

      <div className="flex items-center gap-3 mt-2 font-mono">
        {task.dueDate && (
          <span className={cn(
            "flex items-center gap-1 text-[10px]",
            overdue ? "text-red-500 font-semibold" : "text-slate-400"
          )}>
            <Clock className="size-2.5" />
            {formatDate(task.dueDate)}
            {overdue && " ⚠"}
          </span>
        )}
        {task.estimatedMinutes && (
          <span className="text-[10px] text-slate-400 ml-auto">
            {task.estimatedMinutes}m
          </span>
        )}
      </div>
    </div>
  );
}

export function TasksKanban({ tasks: initialTasks }: TasksKanbanProps) {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [hoverCol, setHoverCol] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "overdue">("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalInitial, setModalInitial] = useState<Record<string, unknown>>({});
  const [, startTransition] = useTransition();

  function handleDragStart(id: number) { setDraggingId(id); }
  function handleDragEnd() { setDraggingId(null); setHoverCol(null); }

  function handleDrop(colKey: string) {
    if (!draggingId) return;
    const task = tasks.find((t) => t.id === draggingId);
    if (!task || task.status === colKey) { setDraggingId(null); setHoverCol(null); return; }

    // Optimistic update
    setTasks((prev) =>
      prev.map((t) => t.id === draggingId ? { ...t, status: colKey } : t)
    );
    setDraggingId(null);
    setHoverCol(null);

    startTransition(async () => {
      await moveTask(draggingId, colKey);
      router.refresh();
    });
  }

  const today = new Date().toDateString();
  const filtered = tasks.filter((t) => {
    if (filter === "overdue") return isOverdue(t.dueDate, t.status);
    return true;
  });

  const totalByCol = (key: string) => filtered.filter((t) => t.status === key);
  const totalEstMins = (col: string) =>
    filtered.filter((t) => t.status === col).reduce((s, t) => s + (t.estimatedMinutes ?? 0), 0);

  function openNewTask(status: Status) {
    setModalInitial({ status });
    setModalOpen(true);
  }

  return (
    <>
      <TaskModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); router.refresh(); }}
        initial={modalInitial as Parameters<typeof TaskModal>[0]["initial"]}
      />

      {/* Filter chips */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {[
          { key: "all",     label: "Összes" },
          { key: "overdue", label: "Lejárt ⚠" },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key as typeof filter)}
            className={cn(
              "h-7 px-3 rounded-full border text-xs font-mono transition-colors",
              filter === key
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
            )}
          >
            {label}
          </button>
        ))}

        {/* Column summary */}
        <div className="ml-auto flex items-center gap-3 text-[11px] font-mono text-slate-400">
          {COLUMNS.map((col) => (
            <span key={col.key}>
              <span style={{ color: col.color }}>●</span>{" "}
              {totalByCol(col.key).length} {col.label.toLowerCase()}
            </span>
          ))}
        </div>
      </div>

      {/* Kanban grid */}
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(4, minmax(260px, 1fr))" }}>
        {COLUMNS.map((col) => {
          const colTasks = filtered.filter((t) => t.status === col.key);
          const mins = totalEstMins(col.key);
          const hours = Math.floor(mins / 60);
          const remMins = mins % 60;
          const isHover = hoverCol === col.key;

          return (
            <div
              key={col.key}
              className="rounded-xl border flex flex-col transition-colors duration-150"
              style={{
                background: isHover ? `${col.color}0d` : "oklch(0.975 0 0 / 0.6)",
                borderColor: isHover ? col.color : "#e2e8f0",
                minHeight: 200,
                maxHeight: "calc(100vh - 220px)",
              }}
              onDragOver={(e) => { e.preventDefault(); setHoverCol(col.key); }}
              onDragLeave={() => setHoverCol((p) => p === col.key ? null : p)}
              onDrop={() => handleDrop(col.key)}
            >
              {/* Column header */}
              <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-200/80">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: col.color, boxShadow: `0 0 8px ${col.glow}` }}
                />
                <span className="text-xs font-semibold text-slate-700">{col.label}</span>
                <span className="ml-auto font-mono text-[11px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                  {colTasks.length}
                </span>
                {mins > 0 && (
                  <span className="font-mono text-[10px] text-slate-400">
                    {hours > 0 ? `${hours}h` : ""}{remMins > 0 ? ` ${remMins}m` : ""}
                  </span>
                )}
              </div>

              {/* Cards */}
              <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
                {colTasks.map((t) => (
                  <KanbanCard
                    key={t.id}
                    task={t}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    dragging={draggingId === t.id}
                    onQuickCreate={openNewTask}
                  />
                ))}

                <button
                  onClick={() => openNewTask(col.key)}
                  className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-600 hover:bg-white/70 transition-colors"
                >
                  <Plus className="size-3" />
                  Feladat hozzáadása
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
