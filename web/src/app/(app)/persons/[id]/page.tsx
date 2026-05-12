import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { formatDate, formatDateTime } from "@/lib/utils";
import { interactionTypeLabel, interactionDirectionLabel } from "@/lib/interactions";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft, Mail, Phone } from "lucide-react";
import { LogInteractionButton } from "@/components/LogInteractionButton";
import { ContextTasksTab } from "@/components/ContextTasksTab";

const TENANT_ID = 1;

export default async function PersonDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const personId = parseInt(id, 10);
  if (isNaN(personId)) notFound();

  const [person, contacts, interactions, tasks] = await Promise.all([
    db.person.findFirst({ where: { id: personId, tenantId: TENANT_ID } }),
    db.contact.findMany({
      where: { personId, tenantId: TENANT_ID },
      include: { company: true },
      orderBy: [{ endedAt: "asc" }, { startedAt: "desc" }],
    }),
    db.interaction.findMany({
      where: { personId, tenantId: TENANT_ID },
      orderBy: { occurredAt: "desc" },
      take: 50,
    }),
    db.task.findMany({
      where: { personId, tenantId: TENANT_ID, parentTaskId: null },
      include: { _count: { select: { subTasks: true } } },
      orderBy: [{ status: "asc" }, { dueDate: "asc" }],
    }),
  ]);

  if (!person) notFound();

  const currentContact = contacts.find((c) => !c.endedAt);
  const initials =
    [person.firstName?.[0], person.lastName?.[0]].filter(Boolean).join("").toUpperCase() || "?";

  return (
    <div>
      <Link
        href="/persons"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4"
      >
        <ArrowLeft className="size-4" />
        Vissza a személyekhez
      </Link>

      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-full bg-indigo-600 flex items-center justify-center text-white font-semibold text-lg shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold text-slate-900">
                {person.lastName} {person.firstName}
              </h1>
              {currentContact && (
                <p className="text-sm text-slate-500 mt-0.5">
                  {currentContact.role && <span>{currentContact.role} · </span>}
                  <Link
                    href={`/companies/${currentContact.companyId}`}
                    className="hover:text-indigo-600"
                  >
                    {currentContact.company.name}
                  </Link>
                </p>
              )}
              <div className="flex flex-wrap gap-4 mt-3">
                {(person.email || currentContact?.email) && (
                  <a
                    href={`mailto:${person.email ?? currentContact?.email}`}
                    className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-indigo-600"
                  >
                    <Mail className="size-4" />
                    {person.email ?? currentContact?.email}
                  </a>
                )}
                {(person.phone || currentContact?.phone) && (
                  <a
                    href={`tel:${person.phone ?? currentContact?.phone}`}
                    className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-indigo-600"
                  >
                    <Phone className="size-4" />
                    {person.phone ?? currentContact?.phone}
                  </a>
                )}
              </div>
            </div>
          </div>

          <LogInteractionButton
            personId={person.id}
            companyId={currentContact?.companyId}
            personName={`${person.lastName ?? ""} ${person.firstName ?? ""}`.trim()}
            companyName={currentContact?.company.name}
          />
        </div>
      </div>

      <Tabs defaultValue="interactions">
        <TabsList variant="line">
          <TabsTrigger value="interactions">
            Interakciók ({interactions.length})
          </TabsTrigger>
          <TabsTrigger value="tasks">
            Feladatok ({tasks.filter(t => t.status !== "done" && t.status !== "cancelled").length})
          </TabsTrigger>
          <TabsTrigger value="employment">
            Munkahely ({contacts.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="interactions" className="mt-4">
          {interactions.length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center">
              Nincs rögzített interakció.
            </p>
          ) : (
            <div className="space-y-3">
              {interactions.map((i) => (
                <div key={i.id} className="bg-white rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold text-slate-700">
                      {interactionTypeLabel(i.type)}
                    </span>
                    {i.direction && (
                      <span className="text-xs text-slate-400">
                        · {interactionDirectionLabel(i.direction)}
                      </span>
                    )}
                    <span className="ml-auto text-xs text-slate-400">
                      {formatDateTime(i.occurredAt)}
                    </span>
                  </div>
                  {i.notes && (
                    <p className="text-sm text-slate-700 whitespace-pre-line">{i.notes}</p>
                  )}
                  {i.outcome && (
                    <p className="text-xs text-slate-400 mt-1">Eredmény: {i.outcome}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="tasks" className="mt-4">
          <ContextTasksTab
            tasks={tasks}
            personId={person.id}
            personName={`${person.lastName ?? ""} ${person.firstName ?? ""}`.trim()}
            companyId={currentContact?.companyId}
            companyName={currentContact?.company.name}
          />
        </TabsContent>

        <TabsContent value="employment" className="mt-4">
          {contacts.length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center">
              Nincs rögzített munkahely.
            </p>
          ) : (
            <div className="space-y-3">
              {contacts.map((c) => (
                <div
                  key={c.id}
                  className="bg-white rounded-xl border border-slate-200 p-4 flex items-start justify-between gap-4"
                >
                  <div>
                    <Link
                      href={`/companies/${c.companyId}`}
                      className="font-medium text-slate-900 hover:text-indigo-600"
                    >
                      {c.company.name}
                    </Link>
                    {c.role && <p className="text-sm text-slate-500 mt-0.5">{c.role}</p>}
                    <p className="text-xs text-slate-400 mt-1">
                      {formatDate(c.startedAt)} –{" "}
                      {c.endedAt ? formatDate(c.endedAt) : "jelenleg"}
                    </p>
                  </div>
                  {!c.endedAt && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700 shrink-0">
                      Aktív
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
