import { db } from "@/lib/db";
import Link from "next/link";
import { TasksClient } from "./TasksClient";
import { TasksKanban } from "./TasksKanban";
import { NewTaskButton } from "./NewTaskButton";
import { ViewToggle } from "./ViewToggle";

const TENANT_ID = 1;

interface SearchParams {
  status?: string;
  due?: string;
  view?: string;
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const view = params.view === "kanban" ? "kanban" : "list";
  const statusFilter = params.status ?? "open";
  const dueFilter = params.due ?? "all";

  const now = new Date();
  const todayStart = new Date(now.toDateString());
  const weekEnd = new Date(todayStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const dueWhere =
    dueFilter === "overdue"
      ? { dueDate: { lt: todayStart } }
      : dueFilter === "today"
        ? { dueDate: { gte: todayStart, lt: new Date(todayStart.getTime() + 86400000) } }
        : dueFilter === "week"
          ? { dueDate: { gte: todayStart, lt: weekEnd } }
          : {};

  const statusWhere =
    view === "kanban"
      ? {} // kanban shows all statuses
      : statusFilter === "open"
        ? { status: { in: ["created", "not_started", "in_progress"] } }
        : statusFilter === "done"
          ? { status: "done" }
          : {};

  const tasks = await db.task.findMany({
    where: {
      tenantId: TENANT_ID,
      parentTaskId: null,
      ...statusWhere,
      ...(view === "list" ? dueWhere : {}),
    },
    include: {
      company: { select: { id: true, name: true } },
      person:  { select: { id: true, firstName: true, lastName: true } },
      _count:  { select: { subTasks: true } },
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    take: view === "kanban" ? 500 : 200,
  });

  const openCount = await db.task.count({
    where: {
      tenantId: TENANT_ID,
      status: { in: ["created", "not_started", "in_progress"] },
      parentTaskId: null,
    },
  });

  const overdueCount = await db.task.count({
    where: {
      tenantId: TENANT_ID,
      status: { in: ["created", "not_started", "in_progress"] },
      dueDate: { lt: todayStart },
      parentTaskId: null,
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em", margin: 0, color: "var(--fg)", display: "flex", alignItems: "baseline", gap: 8 }}>
          Feladatok
          <span className="font-mono-ndt" style={{ fontSize: 12, color: "var(--fg-faint)", fontWeight: 400 }}>
            {openCount} nyitott
            {overdueCount > 0 && (
              <span style={{ color: "var(--coral)", marginLeft: 6 }}>· {overdueCount} lejárt</span>
            )}
          </span>
        </h1>
        <div className="flex items-center gap-2">
          <ViewToggle view={view} statusFilter={statusFilter} dueFilter={dueFilter} />
          <NewTaskButton />
        </div>
      </div>

      {view === "list" && (
        <>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center gap-0.5" style={{ background: "var(--bg-panel)", border: "1px solid var(--line-soft)", borderRadius: 6, padding: 2 }}>
              {[
                { key: "open", label: "Nyitott" },
                { key: "done", label: "Kész" },
                { key: "all",  label: "Mind" },
              ].map(({ key, label }) => (
                <Link
                  key={key}
                  href={`/tasks?status=${key}&due=${dueFilter}&view=list`}
                  className="font-mono-ndt rounded"
                  style={{
                    fontSize: 11, padding: "3px 10px",
                    background: statusFilter === key ? "var(--bg-hover)" : "transparent",
                    color: statusFilter === key ? "var(--fg)" : "var(--fg-mute)",
                  }}
                >
                  {label}
                </Link>
              ))}
            </div>

            <div className="flex items-center gap-0.5" style={{ background: "var(--bg-panel)", border: "1px solid var(--line-soft)", borderRadius: 6, padding: 2 }}>
              {[
                { key: "all",     label: "Összes" },
                { key: "overdue", label: "Lejárt" },
                { key: "today",   label: "Ma" },
                { key: "week",    label: "Héten" },
              ].map(({ key, label }) => (
                <Link
                  key={key}
                  href={`/tasks?status=${statusFilter}&due=${key}&view=list`}
                  className="font-mono-ndt rounded"
                  style={{
                    fontSize: 11, padding: "3px 10px",
                    background: dueFilter === key ? "var(--bg-hover)" : "transparent",
                    color: dueFilter === key ? "var(--fg)" : "var(--fg-mute)",
                  }}
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>

          <TasksClient tasks={tasks} />
        </>
      )}

      {view === "kanban" && <TasksKanban tasks={tasks} />}
    </div>
  );
}
