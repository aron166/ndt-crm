"use server";

import { db } from "@/lib/db";

const TENANT_ID = 1;
const LIMIT = 5; // results per group

export interface SearchResults {
  companies: { id: number; name: string; city: string | null; pipelineStatus: string | null }[];
  persons:   { id: number; firstName: string | null; lastName: string | null; email: string | null; company: string | null }[];
  deals:     { id: number; title: string; stageName: string | null; value: number | null; companyName: string }[];
  tasks:     { id: number; title: string; status: string; companyName: string | null }[];
  tags:      { id: number; name: string; color: string; count: number }[];
}

export async function globalSearch(query: string): Promise<SearchResults> {
  const q = query.trim();
  if (q.length < 1) return { companies: [], persons: [], deals: [], tasks: [], tags: [] };

  // Use Prisma's contains with insensitive mode — backed by the GIN trigram index
  const [companies, persons, deals, tasks, tags] = await Promise.all([
    db.company.findMany({
      where: { tenantId: TENANT_ID, name: { contains: q, mode: "insensitive" } },
      select: { id: true, name: true, city: true, pipelineStatus: true },
      orderBy: { name: "asc" },
      take: LIMIT,
    }),
    db.person.findMany({
      where: {
        tenantId: TENANT_ID,
        OR: [
          { firstName: { contains: q, mode: "insensitive" } },
          { lastName:  { contains: q, mode: "insensitive" } },
          { email:     { contains: q, mode: "insensitive" } },
        ],
      },
      select: {
        id: true, firstName: true, lastName: true, email: true,
        contacts: {
          where: { endedAt: null },
          select: { company: { select: { name: true } } },
          take: 1,
        },
      },
      take: LIMIT,
    }),
    db.deal.findMany({
      where: { tenantId: TENANT_ID, title: { contains: q, mode: "insensitive" } },
      select: {
        id: true, title: true,
        stage: { select: { name: true } },
        value: true,
        company: { select: { name: true } },
      },
      take: LIMIT,
    }),
    db.task.findMany({
      where: {
        tenantId: TENANT_ID,
        title: { contains: q, mode: "insensitive" },
        parentTaskId: null,
      },
      select: {
        id: true, title: true, status: true,
        company: { select: { name: true } },
      },
      take: LIMIT,
    }),
    db.tag.findMany({
      where: { tenantId: TENANT_ID, name: { contains: q, mode: "insensitive" } },
      select: {
        id: true, name: true, color: true,
        _count: { select: { taggings: true } },
      },
      take: LIMIT,
    }),
  ]);

  return {
    companies,
    persons: persons.map((p) => ({
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      email: p.email,
      company: p.contacts[0]?.company.name ?? null,
    })),
    deals: deals.map((d) => ({
      id: d.id,
      title: d.title,
      stageName: d.stage?.name ?? null,
      value: d.value ? Number(d.value) : null,
      companyName: d.company.name,
    })),
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      companyName: t.company?.name ?? null,
    })),
    tags: tags.map((t) => ({ id: t.id, name: t.name, color: t.color, count: t._count.taggings })),
  };
}
