import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  if (q.length < 1) return NextResponse.json([]);

  const results = await db.person.findMany({
    where: {
      tenantId: 1,
      OR: [
        { firstName: { contains: q, mode: "insensitive" } },
        { lastName:  { contains: q, mode: "insensitive" } },
        { email:     { contains: q, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      contacts: {
        where: { endedAt: null },
        select: { company: { select: { name: true } } },
        take: 1,
      },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 10,
  });
  const mapped = results.map((p) => ({
    id: p.id,
    label: [p.lastName, p.firstName].filter(Boolean).join(" ") || p.email || String(p.id),
    sub: p.contacts[0]?.company.name ?? p.email ?? undefined,
  }));
  return NextResponse.json(mapped);
}
