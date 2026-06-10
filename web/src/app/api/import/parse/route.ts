import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

export const runtime = "nodejs";

const MAX_ROWS = 10000;
const MAX_BYTES = 15 * 1024 * 1024; // 15 MB

interface ParsedSheet {
  name: string;
  columns: string[];
  rows: Record<string, unknown>[];
}

/** Clean header row → unique, non-empty column names. */
function makeColumns(rawHeader: unknown[]): string[] {
  const seen = new Map<string, number>();
  return rawHeader.map((h, i) => {
    let name = h == null ? "" : String(h).trim();
    if (!name) name = `Oszlop ${i + 1}`;
    const n = seen.get(name) ?? 0;
    seen.set(name, n + 1);
    return n === 0 ? name : `${name} (${n + 1})`;
  });
}

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Nincs feltöltött fájl." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "A fájl túl nagy (max 15 MB)." }, { status: 413 });
  }

  let wb: XLSX.WorkBook;
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    wb = XLSX.read(buf, { type: "buffer", cellDates: true });
  } catch {
    return NextResponse.json({ error: "A fájl nem olvasható (xlsx/csv várt)." }, { status: 400 });
  }

  let truncated = false;
  const sheets: ParsedSheet[] = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1, defval: null, raw: false, blankrows: false,
    });
    if (aoa.length === 0) continue;
    const columns = makeColumns(aoa[0]);
    let dataRows = aoa.slice(1);
    if (dataRows.length > MAX_ROWS) {
      dataRows = dataRows.slice(0, MAX_ROWS);
      truncated = true;
    }
    const rows = dataRows
      .map((arr) => {
        const obj: Record<string, unknown> = {};
        columns.forEach((c, i) => { obj[c] = arr[i] ?? null; });
        return obj;
      })
      .filter((obj) => Object.values(obj).some((v) => v != null && String(v).trim() !== ""));
    sheets.push({ name, columns, rows });
  }

  if (sheets.length === 0) {
    return NextResponse.json({ error: "A fájl nem tartalmaz adatot." }, { status: 400 });
  }
  return NextResponse.json({ sheets, truncated });
}
