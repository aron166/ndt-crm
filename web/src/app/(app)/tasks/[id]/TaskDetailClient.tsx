"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, CheckCircle2, Pencil } from "lucide-react";
import k from "@/components/astryx/page.module.css";
import { TaskModal } from "../TaskModal";
import { TaskStatusBadge } from "@/components/TaskStatusBadge";
import { reopenTask } from "@/app/actions/tasks";
import { useTaskCompletion } from "@/components/useTaskCompletion";
import { formatDate } from "@/lib/utils";
import Link from "next/link";

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
  leadId: number | null;
  parentTaskId: number | null;
  company: { id: number; name: string } | null;
  person: { id: number; firstName: string | null; lastName: string | null } | null;
  costCode: string | null;
  costQuantity: number | null;
  costUnit: string | null;
  costUnitRate: number | null;
  costAmount: number | null;
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
  leadId: number | null;
  parentTaskId: number | null;
  costCode: string | null;
  costQuantity: number | null;
  costUnit: string | null;
  costUnitRate: number | null;
  costAmount: number | null;
  subTasks: SubTask[];
}

export function TaskDetailClient({ task }: { task: Task }) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [subTaskOpen, setSubTaskOpen] = useState(false);
  const { complete, logModal } = useTaskCompletion();

  function handleComplete(t: {
    id: number;
    type: string | null;
    companyId: number | null;
    personId: number | null;
    leadId: number | null;
    company?: { name: string } | null;
    person?: { firstName: string | null; lastName: string | null } | null;
  }) {
    const personName = t.person
      ? `${t.person.lastName ?? ""} ${t.person.firstName ?? ""}`.trim()
      : undefined;
    return complete({
      id: t.id,
      type: t.type,
      companyId: t.companyId,
      personId: t.personId,
      leadId: t.leadId,
      companyName: t.company?.name,
      personName,
    });
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
          costCode: task.costCode,
          costQuantity: task.costQuantity,
          costUnit: task.costUnit,
          costUnitRate: task.costUnitRate,
        }}
      />
      <TaskModal
        open={subTaskOpen}
        onClose={() => { setSubTaskOpen(false); router.refresh(); }}
        initial={{ parentTaskId: task.id, companyId: task.companyId, personId: task.personId }}
      />
      {logModal}

      <div className={k.actions} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className={k.btn} onClick={() => setEditOpen(true)}>
          <Pencil className="size-4" />
          Szerkesztés
        </button>
        {task.status !== "done" ? (
          <button type="button" className={`${k.btn} ${k.btnPrimary}`} onClick={() => handleComplete(task)}>
            <CheckCircle2 className="size-4" />
            Kész
          </button>
        ) : (
          <button type="button" className={k.btn} onClick={() => handleReopen(task.id)}>
            Újranyitás
          </button>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
        <div className={k.kv}>
          <h2 className={k.h2}>Alfeladatok ({task.subTasks.length})</h2>
          <button type="button" className={k.btn} onClick={() => setSubTaskOpen(true)}>
            <Plus className="size-4" />
            Hozzáadás
          </button>
        </div>
        {task.subTasks.length === 0 ? (
          <span className={k.muted}>Nincsenek alfeladatok.</span>
        ) : (
          task.subTasks.map((s) => (
            <div key={s.id} className={k.row} style={{ gridTemplateColumns: "6px minmax(0, 1fr) auto auto" }} data-u={s.status === "done" ? "done" : undefined}>
              <span className={k.bar} />
              <div className={k.nameLine}>
                <Link href={`/tasks/${s.id}`} className={k.name}>{s.title}</Link>
                {s.dueDate && <span className={k.muted}>{formatDate(s.dueDate)}</span>}
              </div>
              <TaskStatusBadge status={s.status} />
              {s.status !== "done" ? (
                <button type="button" className={k.btn} onClick={() => handleComplete(s)} aria-label="Kész" title="Kész">
                  <CheckCircle2 className="size-4" />
                </button>
              ) : <span />}
            </div>
          ))
        )}
      </div>
    </>
  );
}
