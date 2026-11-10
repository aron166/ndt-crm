import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { formatDate, formatDateTime, formatHUF } from "@/lib/utils";
import { TaskStatusBadge } from "@/components/TaskStatusBadge";
import { TaskDetailClient } from "./TaskDetailClient";
import { serializeTaskCost, rollupTaskCost, costCodeLabel } from "@/lib/tasks/costing";
import { EntityTags } from "@/components/tags/EntityTags";
import { AuditLogTab } from "@/components/AuditLogTab";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/astryx/PageHeader";
import k from "@/components/astryx/page.module.css";

const TENANT_ID = 1;

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const taskId = parseInt(id, 10);
  if (isNaN(taskId)) notFound();

  const task = await db.task.findFirst({
    where: { id: taskId, tenantId: TENANT_ID },
    include: {
      company: { select: { id: true, name: true } },
      person: { select: { id: true, firstName: true, lastName: true } },
      subTasks: {
        include: {
          company: { select: { id: true, name: true } },
          person: { select: { id: true, firstName: true, lastName: true } },
          _count: { select: { subTasks: true } },
        },
        orderBy: { createdAt: "asc" },
      },
      parentTask: { select: { id: true, title: true } },
    },
  });

  if (!task) notFound();

  const taskForClient = {
    ...serializeTaskCost(task),
    subTasks: task.subTasks.map(serializeTaskCost),
  };
  const costRollup = rollupTaskCost(
    { costCode: taskForClient.costCode, costAmount: taskForClient.costAmount },
    taskForClient.subTasks.map((s) => ({ costCode: s.costCode, costAmount: s.costAmount })),
  );

  return (
    <div>
      <Link href="/tasks" className={k.back}>
        <ArrowLeft className="size-4" />
        Vissza a feladatokhoz
      </Link>

      <PageHeader
        title={task.title}
        eyebrow={
          task.parentTask ? (
            <>
              Alfeladata:{" "}
              <Link href={`/tasks/${task.parentTask.id}`} className={k.link}>
                {task.parentTask.title}
              </Link>
            </>
          ) : undefined
        }
      />

      <div className={k.split}>
        <div>
          {task.description && (
            <section className={k.section}>
              <h2 className={k.h2}>Leírás</h2> {/* PROPOSAL copy */}
              <p style={{ margin: 0, whiteSpace: "pre-line", color: "var(--ui-text)" }}>{task.description}</p>
            </section>
          )}

          {costRollup.byCode.length > 0 && (
            <section className={k.section}>
              <div className={k.kv}>
                <h2 className={k.h2}>Elszámolás</h2>
                <span className={k.num}><strong>{formatHUF(costRollup.total)}</strong></span>
              </div>
              <div className={k.tableWrap}>
                <table className={k.table}>
                  <tbody>
                    {costRollup.byCode.map((line) => (
                      <tr key={line.code}>
                        <td>{costCodeLabel(line.code)}</td>
                        <td className={k.num} style={{ textAlign: "right" }}>{formatHUF(line.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <span className={k.muted}>
                A feladat és alfeladatai költségkódonként összesítve · ebből készül a számla.
              </span>
            </section>
          )}

          <section className={k.section}>
            <TaskDetailClient task={taskForClient} />
          </section>

          <section className={k.section}>
            <h2 className={k.h2}>Tags</h2>
            <EntityTags type="task" id={task.id} />
          </section>

          <section className={k.section}>
            <details>
              <summary className={k.muted} style={{ cursor: "pointer" }}>Előzmények</summary>
              <div style={{ marginTop: 12 }}>
                <AuditLogTab type="task" id={task.id} />
              </div>
            </details>
          </section>
        </div>

        <aside className={`${k.card} ${k.asideFirst}`}>
          <div className={k.kv}><span>Státusz</span> {/* PROPOSAL copy */}<TaskStatusBadge status={task.status} /></div>
          <div className={k.kv}><span>Típus</span><span>{(task.type ?? "internal").replace("_", " ")}</span></div>
          <div className={k.kv}><span>Kategória</span><span>{task.category ?? "-"}</span></div>
          {task.dueDate && <div className={k.kv}><span>Határidő</span><span>{formatDate(task.dueDate)}</span></div>}
          {task.company && (
            <div className={k.kv}>
              <span>Cég</span> {/* PROPOSAL copy */}
              <Link href={`/companies/${task.company.id}`} className={k.link}>{task.company.name}</Link>
            </div>
          )}
          {task.person && (
            <div className={k.kv}>
              <span>Személy</span> {/* PROPOSAL copy */}
              <Link href={`/persons/${task.person.id}`} className={k.link}>{task.person.lastName} {task.person.firstName}</Link>
            </div>
          )}
          {task.estimatedMinutes && (
            <div className={k.kv}>
              <span>Tervezett</span>
              <span>
                {task.estimatedMinutes} perc
                {task.actualMinutes && ` / tényleges: ${task.actualMinutes} perc`}
              </span>
            </div>
          )}
          {task.completedAt && <div className={k.kv}><span>Befejezve</span><span>{formatDateTime(task.completedAt)}</span></div>}
        </aside>
      </div>
    </div>
  );
}
