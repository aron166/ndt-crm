import { db } from "@/lib/db";
import { PageHeader, Seg } from "@/components/astryx/PageHeader";
import { TasksClient } from "./TasksClient";
import { TasksKanban } from "./TasksKanban";
import { NewTaskButton } from "./NewTaskButton";
import { ViewToggle } from "./ViewToggle";
import { serializeTaskCost } from "@/lib/tasks/costing";

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
  const tasksForClient = tasks.map(serializeTaskCost);

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

  const statusSeg = [
    { key: "open", label: "Nyitott" },
    { key: "done", label: "Kész" },
    { key: "all", label: "Mind" },
  ].map(({ key, label }) => ({ key, label, href: `/tasks?status=${key}&due=${dueFilter}&view=list` }));
  const dueSeg = [
    { key: "all", label: "Összes" },
    { key: "overdue", label: "Lejárt" },
    { key: "today", label: "Ma" },
    { key: "week", label: "Héten" },
  ].map(({ key, label }) => ({ key, label, href: `/tasks?status=${statusFilter}&due=${key}&view=list` }));

  return (
    <div>
      <PageHeader
        title="Feladatok"
        eyebrow={`${openCount} nyitott` + (overdueCount > 0 ? `, ${overdueCount} lejárt` : "")}
        views={<ViewToggle view={view} statusFilter={statusFilter} dueFilter={dueFilter} />}
        actions={<NewTaskButton />}
        filters={
          view === "list" ? (
            <>
              <Seg label="Státusz" current={statusFilter} items={statusSeg} />
              <Seg label="Határidő" current={dueFilter} items={dueSeg} />
            </>
          ) : undefined
        }
      />

      {view === "list" && <TasksClient tasks={tasksForClient} />}

      {view === "kanban" && <TasksKanban tasks={tasksForClient} />}
    </div>
  );
}
