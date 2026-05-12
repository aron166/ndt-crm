import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";

  const tags = await db.tag.findMany({
    where: {
      tenantId: 1,
      ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
    },
    select: { id: true, name: true, color: true },
    orderBy: { name: "asc" },
    take: 20,
  });
  return NextResponse.json(tags);
}
