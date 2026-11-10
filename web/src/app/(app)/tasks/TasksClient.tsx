"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TaskModal } from "./TaskModal";
import { TaskStatusBadge } from "@/components/TaskStatusBadge";
import { reopenTask, deleteTask } from "@/app/actions/tasks";
import { useTaskCompletion } from "@/components/useTaskCompletion";
import { formatDate } from "@/lib/utils";
import { CheckCircle2, RotateCcw, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { Badge } from "@astryxdesign/core/Badge";
import k from "@/components/astryx/page.module.css";

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
  leadId: number | null;
  parentTaskId: number | null;
  company: { id: number; name: string } | null;
  person: { id: number; firstName: string | null; lastName: string | null } | null;
  costCode: string | null;
  costQuantity: number | null;
  costUnit: string | null;
  costUnitRate: number | null;
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

type GroupKey = "overdue" | "today" | "tomorrow" | "later" | "none" | "done";

// PROPOSAL copy (Holnap, Később, Nincs határidő, Kész group labels; ma, holnap relative days)
const GROUPS: { key: GroupKey; label: string }[] = [
  { key: "overdue", label: "Lejárt" },
  { key: "today", label: "Ma" },
  { key: "tomorrow", label: "Holnap" },
  { key: "later", label: "Később" },
  { key: "none", label: "Nincs határidő" },
  { key: "done", label: "Kész" },
];

function isTomorrow(dueDate: Date) {
  const d = new Date(dueDate);
  const t = new Date();
  t.setDate(t.getDate() + 1);
  return d.toDateString() === t.toDateString();
}

function groupOf(t: Task): GroupKey {
  if (t.status === "done" || t.status === "cancelled") return "done";
  if (!t.dueDate) return "none";
  if (isOverdue(t.dueDate, t.status)) return "overdue";
  if (isToday(t.dueDate)) return "today";
  if (isTomorrow(t.dueDate)) return "tomorrow";
  return "later";
}

const REL: Partial<Record<GroupKey, string>> = { overdue: "lejárt", today: "ma", tomorrow: "holnap" };

export function TasksClient({ tasks }: TasksClientProps) {
  const router = useRouter();
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const { complete, logModal } = useTaskCompletion();

  function handleComplete(task: Task) {
    const personName = task.person
      ? `${task.person.lastName ?? ""} ${task.person.firstName ?? ""}`.trim()
      : undefined;
    return complete({
      id: task.id,
      type: task.type,
      companyId: task.companyId,
      personId: task.personId,
      leadId: task.leadId,
      companyName: task.company?.name,
      personName,
    });
  }

  // Both were bare `await action(); router.refresh()` inside the click — the
  // await and the refresh's re-render ran as blocking work attributed to the
  // interaction. Same `startTransition` shape the kanbans already use.
  const [, startTransition] = useTransition();

  function handleReopen(id: number) {
    startTransition(async () => {
      await reopenTask(id);
      router.refresh();
    });
  }

  function handleDelete(id: number) {
    if (!confirm("Biztosan törlöd ezt a feladatot?")) return;
    startTransition(async () => {
      await deleteTask(id);
      router.refresh();
    });
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
                costCode: editTask.costCode,
                costQuantity: editTask.costQuantity,
                costUnit: editTask.costUnit,
                costUnitRate: editTask.costUnitRate,
              }
            : undefined
        }
      />
      {logModal}

      {tasks.length === 0 && (
        <div className={k.empty}>
          <span>Nincs feladat ebben a nézetben.</span>
        </div>
      )}
      {GROUPS.map((g) => {
        const rows = tasks.filter((t) => groupOf(t) === g.key);
        if (rows.length === 0) return null;
        return (
          <section key={g.key} className={k.group} aria-labelledby={`g-${g.key}`}>
            <div className={k.groupHead}>
              <h2 id={`g-${g.key}`} className={k.groupTitle}>{g.label}</h2>
              <span className={k.muted}>{rows.length}</span>
            </div>
            {rows.map((t) => {
              const done = t.status === "done";
              const timed = g.key === "today" || g.key === "tomorrow";
              return (
                <div key={t.id} className={k.row} data-u={g.key === "overdue" || g.key === "today" || g.key === "done" ? g.key : undefined}>
                  <span className={k.bar} />
                  <div className={k.cell}>
                    <div className={k.nameLine}>
                      <Link href={`/tasks/${t.id}`} className={k.name}>{t.title}</Link>
                      {t.type && <Badge variant="neutral" label={t.type.replace("_", " ")} />}
                    </div>
                  </div>
                  <div className={k.cell}>
                    <div className={k.meta}>
                      {t.company && <Link href={`/companies/${t.company.id}`} className={k.strong}>{t.company.name}</Link>}
                      {t.person && <Link href={`/persons/${t.person.id}`} className={k.muted}>{t.person.lastName} {t.person.firstName}</Link>}
                      {!t.company && !t.person && <span className={k.muted}>-</span>}
                    </div>
                    <div className={k.meta}>
                      <TaskStatusBadge status={t.status} />
                      {t._count.subTasks > 0 && <span className={k.muted}>↳ {t._count.subTasks}</span>}
                    </div>
                  </div>
                  <div className={k.cell}>
                    {t.dueDate ? (
                      <>
                        <span className={k.time}>
                          {timed
                            ? new Intl.DateTimeFormat("hu-HU", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(t.dueDate))
                            : formatDate(t.dueDate)}
                        </span>
                        {REL[g.key] && <span className={k.muted}>{REL[g.key]}</span>}
                      </>
                    ) : <span className={k.muted}>-</span>}
                  </div>
                  <div className={k.cellEnd}>
                    {!done && (
                      <button type="button" className={`${k.btn} ${k.btnPrimary}`} onClick={() => handleComplete(t)} title="Kész">
                        <CheckCircle2 className="size-4" />
                        Kész
                      </button>
                    )}
                    <button type="button" className={k.btn} style={{ minWidth: 40, padding: 0 }} aria-label="Szerkesztés" title="Szerkesztés"
                      onClick={() => { setEditTask(t); setModalOpen(true); }}>
                      <Pencil className="size-4" />
                    </button>
                    {done && (
                      <button type="button" className={k.btn} style={{ minWidth: 40, padding: 0 }} aria-label="Újranyitás" title="Újranyitás"
                        onClick={() => handleReopen(t.id)}>
                        <RotateCcw className="size-4" />
                      </button>
                    )}
                    <button type="button" className={k.btn} style={{ minWidth: 40, padding: 0 }} aria-label="Törlés" title="Törlés"
                      onClick={() => handleDelete(t.id)}>
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </section>
        );
      })}
    </>
  );
}
