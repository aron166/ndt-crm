import { NextRequest, NextResponse } from "next/server";
import { runImport } from "@/lib/import/commit";
import type { RawRow, Mapping } from "@/lib/import/build";

export const runtime = "nodejs";
export const maxDuration = 60;

// Single tenant today (decisions.md #12 — kept as a transport-layer literal; the
// import lib itself takes tenantId as input, so it's ctx-ready).
const TENANT_ID = 1;
const MAX_ROWS = 10000;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Érvénytelen kérés." }, { status: 400 });
  }

  const { entity, mapping, rows, dryRun } = body as {
    entity?: unknown; mapping?: unknown; rows?: unknown; dryRun?: unknown;
  };

  if (entity !== "company" && entity !== "person") {
    return NextResponse.json({ error: "Ismeretlen entitás." }, { status: 400 });
  }
  if (!Array.isArray(rows)) {
    return NextResponse.json({ error: "Hiányzó sorok." }, { status: 400 });
  }
  if (rows.length > MAX_ROWS) {
    return NextResponse.json({ error: `Túl sok sor (max ${MAX_ROWS}).` }, { status: 413 });
  }
  if (!mapping || typeof mapping !== "object") {
    return NextResponse.json({ error: "Hiányzó oszlop-párosítás." }, { status: 400 });
  }

  // A mapping must target the entity's required field, or every row fails.
  const targets = new Set(Object.values(mapping as Record<string, string>));
  const requiredOk = entity === "company" ? targets.has("name") : (targets.has("fullName") || targets.has("lastName") || targets.has("firstName"));
  if (!requiredOk) {
    return NextResponse.json(
      { error: entity === "company" ? "A cégnév oszlopot be kell állítani." : "A név oszlopot be kell állítani." },
      { status: 400 },
    );
  }

  const result = await runImport(entity, rows as RawRow[], mapping as Mapping, {
    dryRun: Boolean(dryRun),
    tenantId: TENANT_ID,
  });
  return NextResponse.json(result);
}
