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
                costCode: editTask.costCode,
                costQuantity: editTask.costQuantity,
                costUnit: editTask.costUnit,
                costUnitRate: editTask.costUnitRate,
              }
            : undefined
        }
      />

      <div className="rounded-xl overflow-hidden" style={{ background: "var(--bg-panel)", border: "1px solid var(--line-soft)" }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 13 }}>
          <thead>
            <tr>
              {["", "Feladat", "Típus", "Határidő", "Cég / Személy", "Státusz", ""].map((h, i) => (
                <th key={i} style={{
                  textAlign: "left", padding: i === 0 ? "10px 12px" : "10px 16px",
                  fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em",
                  color: "var(--fg-faint)", borderBottom: "1px solid var(--line-soft)",
                  background: "oklch(0.20 0.014 255 / 0.5)",
                  display: i >= 2 && i <= 4 ? undefined : undefined,
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tasks.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: "48px 16px", textAlign: "center", color: "var(--fg-faint)" }}>
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
                  style={{ borderBottom: "1px solid var(--line-soft)", transition: "background 0.12s", opacity: t.status === "done" ? 0.6 : 1 }}
                  onMouseOver={(e) => (e.currentTarget.style.background = "oklch(0.66 0.19 278 / 0.05)")}
                  onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <td style={{ padding: "8px 12px", width: 36 }}>
                    {t.status !== "done" ? (
                      <button
                        onClick={() => handleComplete(t.id)}
                        style={{ width: 18, height: 18, borderRadius: "50%", border: "1.5px solid var(--line)", background: "transparent", cursor: "pointer", transition: "border-color .15s" }}
                        onMouseOver={(e) => (e.currentTarget.style.borderColor = "var(--mint)")}
                        onMouseOut={(e) => (e.currentTarget.style.borderColor = "var(--line)")}
                        title="Kész"
                      />
                    ) : (
                      <CheckCircle2 style={{ width: 18, height: 18, color: "var(--mint)" }} />
                    )}
                  </td>
                  <td style={{ padding: "8px 16px" }}>
                    <Link
                      href={`/tasks/${t.id}`}
                      style={{ fontWeight: 500, color: t.status === "done" ? "var(--fg-faint)" : "var(--fg)", textDecoration: t.status === "done" ? "line-through" : "none" }}
                      onMouseOver={(e) => (e.currentTarget.style.color = "var(--indigo)")}
                      onMouseOut={(e) => (e.currentTarget.style.color = t.status === "done" ? "var(--fg-faint)" : "var(--fg)")}
                    >
                      {t.title}
                    </Link>
                    {t._count.subTasks > 0 && (
                      <span className="font-mono-ndt" style={{ marginLeft: 8, fontSize: 10, color: "var(--fg-faint)" }}>
                        ↳ {t._count.subTasks}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "8px 16px" }}>
                    <span className="font-mono-ndt" style={{ fontSize: 11, color: "var(--fg-mute)", textTransform: "capitalize" }}>
                      {(t.type ?? "").replace("_", " ")}
                    </span>
                  </td>
                  <td style={{ padding: "8px 16px" }}>
                    <span className="font-mono-ndt" style={{ fontSize: 11, color: overdue ? "var(--coral)" : today ? "var(--amber)" : "var(--fg-faint)", fontWeight: overdue || today ? 600 : 400 }}>
                      {t.dueDate ? formatDate(t.dueDate) : "—"}{overdue && " ⚠"}
                    </span>
                  </td>
                  <td style={{ padding: "8px 16px", fontSize: 12, color: "var(--fg-mute)" }}>
                    {t.company && <Link href={`/companies/${t.company.id}`} style={{ color: "var(--fg-mute)" }} onMouseOver={(e) => (e.currentTarget.style.color = "var(--indigo)")} onMouseOut={(e) => (e.currentTarget.style.color = "var(--fg-mute)")}>{t.company.name}</Link>}
                    {t.person && <span>{t.company && " · "}<Link href={`/persons/${t.person.id}`} style={{ color: "var(--fg-faint)" }} onMouseOver={(e) => (e.currentTarget.style.color = "var(--indigo)")} onMouseOut={(e) => (e.currentTarget.style.color = "var(--fg-faint)")}>{t.person.lastName} {t.person.firstName}</Link></span>}
                    {!t.company && !t.person && <span style={{ color: "var(--fg-faint)" }}>—</span>}
                  </td>
                  <td style={{ padding: "8px 16px" }}>
                    <TaskStatusBadge status={t.status} />
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    <div className="flex items-center gap-0.5 justify-end">
                      <button onClick={() => { setEditTask(t); setModalOpen(true); }}
                        style={{ padding: 4, borderRadius: 4, color: "var(--fg-faint)", cursor: "pointer" }}
                        onMouseOver={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.color = "var(--fg)"; }}
                        onMouseOut={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--fg-faint)"; }}
                        title="Szerkesztés">
                        <Pencil style={{ width: 13, height: 13 }} />
                      </button>
                      {t.status === "done" && (
                        <button onClick={() => handleReopen(t.id)}
                          style={{ padding: 4, borderRadius: 4, color: "var(--fg-faint)", cursor: "pointer" }}
                          onMouseOver={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.color = "var(--fg)"; }}
                          onMouseOut={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--fg-faint)"; }}
                          title="Újranyitás">
                          <RotateCcw style={{ width: 13, height: 13 }} />
                        </button>
                      )}
                      <button onClick={() => handleDelete(t.id)}
                        style={{ padding: 4, borderRadius: 4, color: "var(--fg-faint)", cursor: "pointer" }}
                        onMouseOver={(e) => { e.currentTarget.style.background = "var(--coral-soft)"; e.currentTarget.style.color = "var(--coral)"; }}
                        onMouseOut={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--fg-faint)"; }}
                        title="Törlés">
                        <Trash2 style={{ width: 13, height: 13 }} />
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
