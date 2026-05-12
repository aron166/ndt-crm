import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { formatDate, formatDateTime } from "@/lib/utils";
import { interactionTypeLabel, interactionDirectionLabel } from "@/lib/interactions";
import { PipelineStatusBadge } from "@/components/PipelineStatusBadge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Building2, MapPin, Globe, ArrowLeft } from "lucide-react";
import { CompanyContactsTable } from "./CompanyContactsTable";
import { ContextTasksTab } from "@/components/ContextTasksTab";

const TENANT_ID = 1;

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const companyId = parseInt(id, 10);
  if (isNaN(companyId)) notFound();

  const [company, contacts, interactions, tasks] = await Promise.all([
    db.company.findFirst({ where: { id: companyId, tenantId: TENANT_ID } }),
    db.contact.findMany({
      where: { companyId, tenantId: TENANT_ID },
      include: { person: true },
      orderBy: [{ endedAt: "asc" }, { startedAt: "desc" }],
    }),
    db.interaction.findMany({
      where: { companyId, tenantId: TENANT_ID },
      include: { person: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { occurredAt: "desc" },
      take: 50,
    }),
    db.task.findMany({
      where: { companyId, tenantId: TENANT_ID, parentTaskId: null },
      include: { _count: { select: { subTasks: true } } },
      orderBy: [{ status: "asc" }, { dueDate: "asc" }],
    }),
  ]);

  if (!company) notFound();

  const openTaskCount = tasks.filter(
    (t) => t.status !== "done" && t.status !== "cancelled"
  ).length;

  return (
    <div>
      <Link
        href="/companies"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4"
      >
        <ArrowLeft className="size-4" />
        Vissza a cégekhez
      </Link>

      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center">
              <Building2 className="size-6 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-900">{company.name}</h1>
              {company.vatNumber && (
                <p className="text-sm text-slate-500">Adószám: {company.vatNumber}</p>
              )}
            </div>
          </div>
          <PipelineStatusBadge status={company.pipelineStatus} />
        </div>

        <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          {(company.city || company.county || company.country) && (
            <div className="flex items-start gap-2 text-slate-600">
              <MapPin className="size-4 mt-0.5 text-slate-400 shrink-0" />
              <span>{[company.city, company.county, company.country].filter(Boolean).join(", ")}</span>
            </div>
          )}
          {company.website && (
            <div className="flex items-center gap-2 text-slate-600">
              <Globe className="size-4 text-slate-400 shrink-0" />
              <a
                href={company.website.startsWith("http") ? company.website : `https://${company.website}`}
                target="_blank" rel="noopener noreferrer"
                className="hover:text-indigo-600 truncate"
              >
                {company.website}
              </a>
            </div>
          )}
          {company.lastInteractionDate && (
            <div className="text-slate-500">
              <span className="text-xs text-slate-400 block">Utolsó interakció</span>
              {formatDate(company.lastInteractionDate)}
            </div>
          )}
          <div className="text-slate-500">
            <span className="text-xs text-slate-400 block">Létrehozva</span>
            {formatDate(company.createdAt)}
          </div>
        </div>
      </div>

      <Tabs defaultValue="contacts">
        <TabsList variant="line">
          <TabsTrigger value="contacts">
            Kapcsolatok ({contacts.length})
          </TabsTrigger>
          <TabsTrigger value="tasks">
            Feladatok{openTaskCount > 0 ? ` (${openTaskCount})` : ""}
          </TabsTrigger>
          <TabsTrigger value="interactions">
            Interakciók ({interactions.length})
          </TabsTrigger>
          <TabsTrigger value="deals">Deals</TabsTrigger>
        </TabsList>

        <TabsContent value="contacts" className="mt-4">
          <CompanyContactsTable
            contacts={contacts}
            companyId={company.id}
            companyName={company.name}
          />
        </TabsContent>

        <TabsContent value="tasks" className="mt-4">
          <ContextTasksTab
            tasks={tasks}
            companyId={company.id}
            companyName={company.name}
          />
        </TabsContent>

        <TabsContent value="interactions" className="mt-4">
          {interactions.length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center">
              Nincs rögzített interakció. Naplózáshoz kattints a Kapcsolatok fülön az egyes személyek melletti gombra.
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
                      <span className="text-xs text-slate-400">· {interactionDirectionLabel(i.direction)}</span>
                    )}
                    {i.person && (
                      <Link href={`/persons/${i.person.id}`} className="ml-1 text-xs text-indigo-600 hover:underline">
                        {i.person.firstName} {i.person.lastName}
                      </Link>
                    )}
                    <span className="ml-auto text-xs text-slate-400">{formatDateTime(i.occurredAt)}</span>
                  </div>
                  {i.notes && <p className="text-sm text-slate-700 whitespace-pre-line">{i.notes}</p>}
                  {i.outcome && <p className="text-xs text-slate-400 mt-1">Eredmény: {i.outcome}</p>}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="deals" className="mt-4">
          <p className="text-sm text-slate-400 py-6 text-center">Hamarosan — Step 4.</p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
