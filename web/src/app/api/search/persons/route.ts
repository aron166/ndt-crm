import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { employerState, employerLabel } from "@/lib/persons/employer";

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
        // Find the person by the company they work at, or used to.
        { contacts: { some: { company: { name: { contains: q, mode: "insensitive" } } } } },
      ],
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      contacts: {
        // Not scoped to the open contact any more: we need the whole history
        // to tell "left, unknown employer" apart from "never had one" (see
        // employerState). take: 20 + this orderBy bound it - a person has a
        // handful of jobs, not hundreds.
        select: { companyId: true, role: true, startedAt: true, endedAt: true, company: { select: { name: true } } },
        take: 20,
        orderBy: [{ endedAt: "asc" }, { startedAt: "desc" }],
      },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 10,
  });
  const mapped = results.map((p) => {
    const state = employerState(p.contacts);
    return {
      id: p.id,
      label: [p.lastName, p.firstName].filter(Boolean).join(" ") || p.email || String(p.id),
      sub: state.kind === "unknown" && p.email ? p.email : employerLabel(state),
    };
  });
  return NextResponse.json(mapped);
}
