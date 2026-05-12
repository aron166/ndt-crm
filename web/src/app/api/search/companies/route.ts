import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  if (q.length < 1) return NextResponse.json([]);

  const results = await db.company.findMany({
    where: {
      tenantId: 1,
      name: { contains: q, mode: "insensitive" },
    },
    select: { id: true, name: true, vatNumber: true },
    orderBy: { name: "asc" },
    take: 10,
  });
  return NextResponse.json(results);
}
