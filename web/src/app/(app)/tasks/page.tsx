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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Feladatok</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {openCount} nyitott
            {overdueCount > 0 && (
              <span className="ml-2 text-red-600 font-medium">
                · {overdueCount} lejárt ⚠
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ViewToggle view={view} statusFilter={statusFilter} dueFilter={dueFilter} />
          <NewTaskButton />
        </div>
      </div>

      {view === "list" && (
        <>
          <div className="flex items-center gap-4 mb-4">
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5">
              {[
                { key: "open", label: "Nyitott" },
                { key: "done", label: "Kész" },
                { key: "all",  label: "Mind" },
              ].map(({ key, label }) => (
                <Link
                  key={key}
                  href={`/tasks?status=${key}&due=${dueFilter}&view=list`}
                  className={`px-3 py-1 rounded-md text-sm transition-colors ${
                    statusFilter === key
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {label}
                </Link>
              ))}
            </div>

            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5">
              {[
                { key: "all",     label: "Összes" },
                { key: "overdue", label: "Lejárt" },
                { key: "today",   label: "Ma" },
                { key: "week",    label: "Héten" },
              ].map(({ key, label }) => (
                <Link
                  key={key}
                  href={`/tasks?status=${statusFilter}&due=${key}&view=list`}
                  className={`px-3 py-1 rounded-md text-sm transition-colors ${
                    dueFilter === key
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
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
