"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Clock } from "lucide-react";
import { moveTask } from "@/app/actions/tasks";
import { useTaskCompletion } from "@/components/useTaskCompletion";
import { TaskModal } from "./TaskModal";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

const COLUMNS = [
  { key: "created",     label: "Kiírva",      color: "var(--fg-mute)",  glow: "oklch(0.62 0.012 255 / 0.4)" },
  { key: "in_progress", label: "Folyamatban", color: "var(--indigo)",   glow: "oklch(0.66 0.19 278 / 0.4)"  },
  { key: "done",        label: "Elvégezve",   color: "var(--mint)",     glow: "oklch(0.80 0.13 165 / 0.4)"  },
  { key: "cancelled",   label: "Törölve",     color: "var(--coral)",    glow: "oklch(0.72 0.18 25 / 0.4)"   },
] as const;

type Status = (typeof COLUMNS)[number]["key"];

const TYPE_COLOR: Record<string, { bg: string; color: string }> = {
  call:        { bg: "var(--mint-soft)",   color: "var(--mint)"   },
  email:       { bg: "var(--indigo-soft)", color: "var(--indigo)" },
  meeting:     { bg: "var(--sky-soft)",    color: "var(--sky)"    },
  document:    { bg: "var(--amber-soft)",  color: "var(--amber)"  },
  field_visit: { bg: "var(--coral-soft)",  color: "var(--coral)"  },
  internal:    { bg: "var(--bg-raised)",   color: "var(--fg-mute)"},
};

const TYPE_LABEL: Record<string, string> = {
  call: "Hívás", email: "Email", meeting: "Találkozó",
  document: "Dok.", field_visit: "Helyszín", internal: "Belső",
};

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

interface TasksKanbanProps { tasks: Task[]; }

function isOverdue(dueDate: Date | null, status: string) {
  if (!dueDate || status === "done" || status === "cancelled") return false;
  return new Date(dueDate) < new Date(new Date().toDateString());
}

function avatarColor(name: string) {
  const colors = [
    "oklch(0.66 0.19 278)", "oklch(0.80 0.13 165)", "oklch(0.80 0.15 75)",
    "oklch(0.78 0.12 230)", "oklch(0.72 0.16 305)", "oklch(0.72 0.18 25)",
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return colors[Math.abs(h) % colors.length];
}

function PersonAvatar({ name }: { name: string }) {
  const initials = name.split(" ").map(p => p[0]).join("").toUpperCase().slice(0, 2);
  return (
    <span
      className="inline-flex items-center justify-center rounded-full font-mono-ndt text-white shrink-0"
      style={{ width: 20, height: 20, fontSize: 9, fontWeight: 600, background: avatarColor(name) }}
    >
      {initials}
    </span>
  );
}

function KanbanCard({
  task,
  onDragStart,
  onDragEnd,
  dragging,
}: {
  task: Task;
  onDragStart: (id: number) => void;
  onDragEnd: () => void;
  dragging: boolean;
}) {
  const overdue = isOverdue(task.dueDate, task.status);
  const typeStyle = TYPE_COLOR[task.type ?? "internal"] ?? TYPE_COLOR.internal;
  const personName = task.person
    ? `${task.person.lastName ?? ""} ${task.person.firstName ?? ""}`.trim()
    : null;

  return (
    <div
      draggable
      onDragStart={() => onDragStart(task.id)}
      onDragEnd={onDragEnd}
      className={cn("group rounded-lg select-none", dragging && "opacity-40 cursor-grabbing")}
      style={{
        background: "var(--bg-panel)",
        border: "1px solid var(--line-soft)",
        padding: "10px 12px",
        cursor: "grab",
        transition: "transform 280ms cubic-bezier(0.32,0.72,0,1), box-shadow 280ms cubic-bezier(0.32,0.72,0,1), border-color 150ms ease",
        willChange: "transform",
      }}
      onMouseOver={(e) => {
        e.currentTarget.style.borderColor = "var(--indigo-line)";
        e.currentTarget.style.boxShadow = "var(--glow-indigo)";
        e.currentTarget.style.transform = "translateY(-2px) rotate(-0.2deg)";
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.borderColor = "var(--line-soft)";
        e.currentTarget.style.boxShadow = "none";
        e.currentTarget.style.transform = "none";
      }}
      onMouseDown={(e) => { e.currentTarget.style.transform = "scale(0.99)"; e.currentTarget.style.transition = "transform 80ms ease"; }}
      onMouseUp={(e) => { e.currentTarget.style.transition = "transform 280ms cubic-bezier(0.32,0.72,0,1), box-shadow 280ms cubic-bezier(0.32,0.72,0,1), border-color 150ms ease"; }}
    >
      {/* Top row: ID + type badge */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="font-mono-ndt" style={{ fontSize: 10, color: "var(--fg-faint)" }}>
          #{task.id}
        </span>
        {task.type && (
          <span
            className="font-mono-ndt rounded"
            style={{
              fontSize: 10, padding: "1px 6px",
              background: typeStyle.bg,
              color: typeStyle.color,
              border: `1px solid ${typeStyle.color}40`,
            }}
          >
            {TYPE_LABEL[task.type] ?? task.type}
          </span>
        )}
      </div>

      {/* Title — links to task detail, stops drag propagation so click works */}
      <Link
        href={`/tasks/${task.id}`}
        style={{
          display: "block",
          fontSize: 13, fontWeight: 500, lineHeight: 1.35,
          color: task.status === "done" ? "var(--fg-faint)" : "var(--fg)",
          textDecoration: task.status === "done" ? "line-through" : "none",
          marginBottom: 8,
        }}
        onClick={(e) => e.stopPropagation()}
        onMouseOver={(e) => { if (task.status !== "done") e.currentTarget.style.color = "var(--indigo)"; }}
        onMouseOut={(e) => { e.currentTarget.style.color = task.status === "done" ? "var(--fg-faint)" : "var(--fg)"; }}
      >
        {task.title}
      </Link>

      {/* Person + company */}
      {(personName || task.company) && (
        <div
          className="flex items-center gap-2 pb-2 mb-2"
          style={{ borderBottom: "1px dashed var(--line-soft)" }}
        >
          {personName && (
            <div className="flex items-center gap-1.5 min-w-0">
              <PersonAvatar name={personName} />
              <Link
                href={`/persons/${task.personId}`}
                className="truncate"
                style={{ fontSize: 11, color: "var(--fg-soft)" }}
                onClick={(e) => e.stopPropagation()}
                onMouseOver={(e) => (e.currentTarget.style.color = "var(--indigo)")}
                onMouseOut={(e) => (e.currentTarget.style.color = "var(--fg-soft)")}
              >
                {personName}
              </Link>
            </div>
          )}
          {task.company && (
            <Link
              href={`/companies/${task.company.id}`}
              className="truncate shrink-0 ml-auto"
              style={{ fontSize: 11, color: "var(--fg-mute)" }}
              onClick={(e) => e.stopPropagation()}
              onMouseOver={(e) => (e.currentTarget.style.color = "var(--indigo)")}
              onMouseOut={(e) => (e.currentTarget.style.color = "var(--fg-mute)")}
            >
              {task.company.name.length > 18 ? task.company.name.slice(0, 16) + "…" : task.company.name}
            </Link>
          )}
        </div>
      )}

      {/* Bottom: due date + est. minutes */}
      <div className="flex items-center gap-2 font-mono-ndt">
        {task.dueDate && (
          <span
            className="flex items-center gap-1"
            style={{
              fontSize: 10,
              color: overdue ? "var(--coral)" : "var(--fg-faint)",
              fontWeight: overdue ? 600 : 400,
            }}
          >
            <Clock style={{ width: 9, height: 9 }} />
            {formatDate(task.dueDate)}
            {overdue && " ⚠"}
          </span>
        )}
        {task._count.subTasks > 0 && (
          <span style={{ fontSize: 10, color: "var(--fg-faint)" }}>
            ↳ {task._count.subTasks}
          </span>
        )}
        {task.estimatedMinutes && (
          <span style={{ fontSize: 10, color: "var(--fg-faint)", marginLeft: "auto" }}>
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
  const [modalStatus, setModalStatus] = useState<Status>("created");
  const [, startTransition] = useTransition();
  const { promptLog, logModal } = useTaskCompletion();

  function handleDrop(colKey: string) {
    if (!draggingId) return;
    const task = tasks.find((t) => t.id === draggingId);
    if (!task || task.status === colKey) { setDraggingId(null); setHoverCol(null); return; }
    setTasks((prev) => prev.map((t) => t.id === draggingId ? { ...t, status: colKey } : t));
    const id = draggingId;
    setDraggingId(null); setHoverCol(null);
    const wasDone = task.status === "done";
    startTransition(async () => {
      await moveTask(id, colKey);
      router.refresh();
      // Offer to log the interaction when a comms task is newly marked done.
      if (colKey === "done" && !wasDone) {
        const personName = task.person
          ? `${task.person.lastName ?? ""} ${task.person.firstName ?? ""}`.trim()
          : undefined;
        promptLog({
          id: task.id,
          type: task.type,
          companyId: task.companyId,
          personId: task.personId,
          companyName: task.company?.name,
          personName,
        });
      }
    });
  }

  const filtered = tasks.filter((t) =>
    filter === "overdue" ? isOverdue(t.dueDate, t.status) : true
  );

  const colTasks = (key: string) => filtered.filter((t) => t.status === key);
  const totalEst = (key: string) => colTasks(key).reduce((s, t) => s + (t.estimatedMinutes ?? 0), 0);

  return (
    <>
      <TaskModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); router.refresh(); }}
        initial={{ status: modalStatus }}
      />
      {logModal}

      {/* Filter chips + stats */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {[
          { key: "all",     label: "Összes" },
          { key: "overdue", label: "Lejárt ⚠" },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key as typeof filter)}
            className="rounded-full font-mono-ndt transition-colors"
            style={{
              height: 26, padding: "0 10px", fontSize: 11,
              background: filter === key ? "var(--indigo-soft)" : "var(--bg-panel)",
              color: filter === key ? "var(--indigo)" : "var(--fg-mute)",
              border: `1px solid ${filter === key ? "var(--indigo-line)" : "var(--line-soft)"}`,
            }}
          >
            {label}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-4 font-mono-ndt" style={{ fontSize: 11, color: "var(--fg-faint)" }}>
          {COLUMNS.map((col) => (
            <span key={col.key} className="flex items-center gap-1">
              <span style={{ color: col.color }}>●</span>
              {colTasks(col.key).length} {col.label.toLowerCase()}
            </span>
          ))}
        </div>
      </div>

      {/* Kanban grid */}
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(4, minmax(250px, 1fr))", alignItems: "start" }}>
        {COLUMNS.map((col) => {
          const cards = colTasks(col.key);
          const mins = totalEst(col.key);
          const h = Math.floor(mins / 60);
          const m = mins % 60;
          const isHover = hoverCol === col.key;

          return (
            <div
              key={col.key}
              className="flex flex-col rounded-xl transition-all duration-150"
              style={{
                background: isHover ? `${col.color}10` : "oklch(0.18 0.014 255 / 0.5)",
                border: `1px solid ${isHover ? col.color : "var(--line-soft)"}`,
                minHeight: 200,
                maxHeight: "calc(100vh - 215px)",
              }}
              onDragOver={(e) => { e.preventDefault(); setHoverCol(col.key); }}
              onDragLeave={() => setHoverCol((p) => p === col.key ? null : p)}
              onDrop={() => handleDrop(col.key)}
            >
              {/* Column header */}
              <div
                className="flex items-center gap-2 shrink-0"
                style={{ padding: "10px 14px 10px", borderBottom: "1px solid var(--line-soft)" }}
              >
                <span
                  className="rounded-full shrink-0"
                  style={{
                    width: 8, height: 8,
                    background: col.color,
                    boxShadow: `0 0 8px ${col.glow}`,
                  }}
                />
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--fg-soft)", letterSpacing: "0.02em" }}>
                  {col.label}
                </span>
                <span
                  className="font-mono-ndt rounded"
                  style={{ marginLeft: "auto", fontSize: 11, background: "var(--bg-raised)", color: "var(--fg-mute)", padding: "1px 6px" }}
                >
                  {cards.length}
                </span>
                {mins > 0 && (
                  <span className="font-mono-ndt" style={{ fontSize: 10, color: "var(--fg-faint)" }}>
                    {h > 0 ? `${h}h` : ""}{m > 0 ? ` ${m}m` : ""}
                  </span>
                )}
              </div>

              {/* Cards */}
              <div className="flex-1 overflow-y-auto flex flex-col gap-2" style={{ padding: 10 }}>
                {cards.map((t) => (
                  <KanbanCard
                    key={t.id}
                    task={t}
                    onDragStart={setDraggingId}
                    onDragEnd={() => { setDraggingId(null); setHoverCol(null); }}
                    dragging={draggingId === t.id}
                  />
                ))}

                <button
                  onClick={() => { setModalStatus(col.key); setModalOpen(true); }}
                  className="flex items-center gap-1.5 w-full rounded-lg transition-colors"
                  style={{
                    height: 30, padding: "0 8px",
                    fontSize: 12, color: "var(--fg-faint)",
                    background: "transparent",
                    border: "1px dashed var(--line-soft)",
                  }}
                  onMouseOver={(e) => { e.currentTarget.style.color = "var(--fg-soft)"; e.currentTarget.style.borderColor = "var(--line)"; }}
                  onMouseOut={(e) => { e.currentTarget.style.color = "var(--fg-faint)"; e.currentTarget.style.borderColor = "var(--line-soft)"; }}
                >
                  <Plus style={{ width: 11, height: 11 }} />
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
