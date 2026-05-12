import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { formatDate, formatDateTime } from "@/lib/utils";
import { TaskStatusBadge } from "@/components/TaskStatusBadge";
import { TaskDetailClient } from "./TaskDetailClient";
import { EntityTags } from "@/components/tags/EntityTags";
import { ArrowLeft, Clock, Building2, User } from "lucide-react";

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

  return (
    <div className="max-w-2xl">
      <Link
        href="/tasks"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4"
      >
        <ArrowLeft className="size-4" />
        Vissza a feladatokhoz
      </Link>

      {task.parentTask && (
        <p className="text-xs text-slate-400 mb-2">
          Alfeladata:{" "}
          <Link
            href={`/tasks/${task.parentTask.id}`}
            className="hover:text-indigo-600"
          >
            {task.parentTask.title}
          </Link>
        </p>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-4">
        <div className="flex items-start justify-between gap-4 mb-4">
          <h1
            className={`text-lg font-semibold text-slate-900 ${task.status === "done" ? "line-through text-slate-400" : ""}`}
          >
            {task.title}
          </h1>
          <TaskStatusBadge status={task.status} />
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm mb-4">
          <div>
            <span className="text-xs text-slate-400 block">Típus</span>
            <span className="text-slate-700 capitalize">
              {(task.type ?? "internal").replace("_", " ")}
            </span>
          </div>
          <div>
            <span className="text-xs text-slate-400 block">Kategória</span>
            <span className="text-slate-700 capitalize">{task.category}</span>
          </div>
          {task.dueDate && (
            <div>
              <span className="text-xs text-slate-400 block">Határidő</span>
              <span className="text-slate-700">{formatDate(task.dueDate)}</span>
            </div>
          )}
          {task.estimatedMinutes && (
            <div className="flex items-center gap-1">
              <Clock className="size-3.5 text-slate-400" />
              <div>
                <span className="text-xs text-slate-400 block">Tervezett</span>
                <span className="text-slate-700">
                  {task.estimatedMinutes} perc
                  {task.actualMinutes && ` / tényleges: ${task.actualMinutes} perc`}
                </span>
              </div>
            </div>
          )}
          {task.completedAt && (
            <div>
              <span className="text-xs text-slate-400 block">Befejezve</span>
              <span className="text-slate-700">
                {formatDateTime(task.completedAt)}
              </span>
            </div>
          )}
        </div>

        {(task.company || task.person) && (
          <div className="flex gap-4 text-sm pt-4 border-t border-slate-100">
            {task.company && (
              <Link
                href={`/companies/${task.company.id}`}
                className="flex items-center gap-1.5 text-slate-600 hover:text-indigo-600"
              >
                <Building2 className="size-4 text-slate-400" />
                {task.company.name}
              </Link>
            )}
            {task.person && (
              <Link
                href={`/persons/${task.person.id}`}
                className="flex items-center gap-1.5 text-slate-600 hover:text-indigo-600"
              >
                <User className="size-4 text-slate-400" />
                {task.person.lastName} {task.person.firstName}
              </Link>
            )}
          </div>
        )}

        {task.description && (
          <p className="text-sm text-slate-700 mt-4 pt-4 border-t border-slate-100 whitespace-pre-line">
            {task.description}
          </p>
        )}

        <div className="mt-4 pt-4 border-t border-slate-100">
          <p className="text-xs text-slate-400 mb-2">Tags</p>
          <EntityTags type="task" id={task.id} />
        </div>
      </div>

      <TaskDetailClient task={task} />
    </div>
  );
}
