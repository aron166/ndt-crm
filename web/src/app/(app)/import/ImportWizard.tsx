"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Upload, ArrowLeft, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { fieldsFor, guessMapping, type ImportEntity } from "@/lib/import/fields";
import type { ImportResult } from "@/lib/import/types";

interface ParsedSheet {
  name: string;
  columns: string[];
  rows: Record<string, unknown>[];
}

const NONE = "__none__";

const panel: React.CSSProperties = {
  background: "var(--bg-panel)",
  border: "1px solid var(--line-soft)",
  borderRadius: 12,
};

export function ImportWizard() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [entity, setEntity] = useState<ImportEntity>("company");
  const [step, setStep] = useState<"upload" | "map" | "result">("upload");
  const [sheets, setSheets] = useState<ParsedSheet[] | null>(null);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [fileName, setFileName] = useState("");
  const [truncated, setTruncated] = useState(false);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dryResult, setDryResult] = useState<ImportResult | null>(null);
  const [finalResult, setFinalResult] = useState<ImportResult | null>(null);

  const fields = useMemo(() => fieldsFor(entity), [entity]);
  const activeSheet = sheets?.[sheetIdx] ?? null;

  const requiredOk = useMemo(() => {
    const t = new Set(Object.values(mapping));
    return entity === "company"
      ? t.has("name")
      : t.has("fullName") || t.has("lastName") || t.has("firstName");
  }, [mapping, entity]);

  function reset() {
    setSheets(null); setSheetIdx(0); setFileName(""); setMapping({});
    setDryResult(null); setFinalResult(null); setError(null); setTruncated(false);
    setStep("upload");
  }

  async function handleFile(file: File) {
    setLoading(true); setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/import/parse", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Hiba a feldolgozás során."); return; }
      const parsed: ParsedSheet[] = data.sheets;
      setSheets(parsed);
      setSheetIdx(0);
      setFileName(file.name);
      setTruncated(Boolean(data.truncated));
      setMapping(guessMapping(parsed[0].columns, entity));
      setStep("map");
    } catch {
      setError("Nem sikerült beolvasni a fájlt.");
    } finally {
      setLoading(false);
    }
  }

  function chooseSheet(idx: number) {
    setSheetIdx(idx);
    if (sheets) setMapping(guessMapping(sheets[idx].columns, entity));
  }

  function setColumnField(col: string, field: string) {
    setMapping((prev) => {
      const next = { ...prev };
      // keep each target field assigned to at most one column
      if (field !== NONE) {
        for (const c of Object.keys(next)) if (next[c] === field) next[c] = "";
      }
      next[col] = field === NONE ? "" : field;
      return next;
    });
  }

  async function runCommit(dryRun: boolean) {
    if (!activeSheet) return;
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity, mapping, rows: activeSheet.rows, dryRun }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Hiba az importálás során."); return; }
      if (dryRun) { setDryResult(data); setStep("result"); }
      else { setFinalResult(data); router.refresh(); }
    } catch {
      setError("Nem sikerült az importálás.");
    } finally {
      setLoading(false);
    }
  }

  const sampleValue = (col: string) => {
    if (!activeSheet) return "";
    for (const row of activeSheet.rows) {
      const v = row[col];
      if (v != null && String(v).trim() !== "") return String(v);
    }
    return "";
  };

  // ── Upload step ──────────────────────────────────────────────
  if (step === "upload") {
    return (
      <div style={panel} className="p-6">
        <EntityToggle entity={entity} onChange={(e) => { setEntity(e); }} />
        <label
          className="mt-5 flex flex-col items-center justify-center gap-2 cursor-pointer rounded-lg py-10 transition-colors"
          style={{ border: "1px dashed var(--line)", background: "var(--bg-raised)" }}
        >
          {loading ? <Loader2 className="size-6 animate-spin" style={{ color: "var(--indigo)" }} />
            : <Upload className="size-6" style={{ color: "var(--fg-mute)" }} />}
          <span style={{ fontSize: 14, color: "var(--fg-soft)" }}>
            {loading ? "Feldolgozás…" : "Kattints a fájl kiválasztásához (.xlsx vagy .csv)"}
          </span>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            disabled={loading}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
          />
        </label>
        {error && <ErrorLine text={error} />}
      </div>
    );
  }

  // ── Result / preview step ────────────────────────────────────
  if (step === "result" && dryResult) {
    const r = finalResult ?? dryResult;
    const done = !!finalResult;
    return (
      <div style={panel} className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 style={{ fontSize: 15, fontWeight: 600, color: "var(--fg)" }}>
            {done ? "Importálás kész" : "Előnézet (még nem mentett)"}
          </h2>
          {done && <CheckCircle2 className="size-5" style={{ color: "var(--mint)" }} />}
        </div>

        <div className="grid grid-cols-4 gap-3 mb-4">
          <Stat label="Új" value={r.created} accent="var(--mint)" />
          <Stat label="Meglévő" value={r.matched} accent="var(--fg-mute)" />
          <Stat label="Kihagyva" value={r.skipped} accent="var(--amber)" />
          <Stat label="Hiba" value={r.errors.length} accent="var(--coral)" />
        </div>
        {entity === "person" && (r.companiesCreated > 0 || r.contactsCreated > 0) && (
          <p className="text-xs text-slate-400 mb-3">
            +{r.companiesCreated} új cég, {r.contactsCreated} kapcsolat (személy ↔ cég){done ? " létrehozva" : " lesz"}.
          </p>
        )}

        <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--line-soft)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "var(--bg-raised)" }}>
                <th style={th}>Sor</th><th style={th}>Megnevezés</th><th style={th}>Állapot</th>
              </tr>
            </thead>
            <tbody>
              {r.sample.map((s) => (
                <tr key={s.row} style={{ borderTop: "1px solid var(--line-soft)" }}>
                  <td style={td} className="font-mono-ndt text-slate-400">{s.row}</td>
                  <td style={td}>{s.label}</td>
                  <td style={td}><StatusPill status={s.status} detail={s.detail} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {r.sample.length < r.total && (
          <p className="text-xs text-slate-400 mt-2">Az első {r.sample.length} sor látszik a {r.total}-ból.</p>
        )}

        {error && <ErrorLine text={error} />}

        <div className="flex items-center gap-2 mt-5">
          {!done ? (
            <>
              <Button variant="outline" onClick={() => setStep("map")} disabled={loading}>
                <ArrowLeft className="size-4 mr-1" /> Vissza
              </Button>
              <Button
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
                onClick={() => runCommit(false)}
                disabled={loading || r.created + r.matched + r.contactsCreated === 0}
              >
                {loading ? <Loader2 className="size-4 mr-1 animate-spin" /> : null}
                Importálás véglegesítése ({r.created} új)
              </Button>
            </>
          ) : (
            <>
              <Link
                href={entity === "company" ? "/companies" : "/persons"}
                className="inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
              >
                {entity === "company" ? "Cégek megnyitása" : "Személyek megnyitása"}
              </Link>
              <Button variant="outline" onClick={reset}>Új importálás</Button>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Mapping step ─────────────────────────────────────────────
  return (
    <div style={panel} className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: "var(--fg)" }}>Oszlopok párosítása</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {fileName} · {activeSheet?.rows.length ?? 0} sor · {entity === "company" ? "Cégek" : "Személyek"}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={reset}>Másik fájl</Button>
      </div>

      {sheets && sheets.length > 1 && (
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs text-slate-400">Munkalap:</span>
          {sheets.map((s, i) => (
            <button
              key={s.name}
              onClick={() => chooseSheet(i)}
              className="rounded-full px-3 py-1 text-xs"
              style={{
                background: i === sheetIdx ? "var(--indigo-soft)" : "var(--bg-raised)",
                color: i === sheetIdx ? "var(--indigo)" : "var(--fg-mute)",
                border: `1px solid ${i === sheetIdx ? "var(--indigo-line)" : "var(--line-soft)"}`,
              }}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {truncated && (
        <p className="text-xs mb-3" style={{ color: "var(--amber)" }}>
          ⚠ A fájl több mint 10 000 sort tartalmaz — csak az első 10 000 lesz importálva.
        </p>
      )}

      <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--line-soft)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "var(--bg-raised)" }}>
              <th style={th}>Fájl oszlop</th><th style={th}>Minta</th><th style={th}>CRM mező</th>
            </tr>
          </thead>
          <tbody>
            {activeSheet?.columns.map((col) => (
              <tr key={col} style={{ borderTop: "1px solid var(--line-soft)" }}>
                <td style={td} className="font-medium">{col}</td>
                <td style={td} className="text-slate-400 truncate max-w-[180px]">{sampleValue(col)}</td>
                <td style={{ ...td, width: 220 }}>
                  <Select value={mapping[col] || NONE} onValueChange={(v) => v && setColumnField(col, v)}>
                    <SelectTrigger className="w-full h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>— Kihagyás —</SelectItem>
                      {fields.map((f) => (
                        <SelectItem key={f.key} value={f.key}>
                          {f.label}{f.required ? " *" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!requiredOk && (
        <p className="text-xs mt-3" style={{ color: "var(--amber)" }}>
          {entity === "company"
            ? "Állítsd be, melyik oszlop a Cégnév."
            : "Állítsd be a név oszlopo(ka)t (Teljes név, vagy Vezeték- és Keresztnév)."}
        </p>
      )}
      {error && <ErrorLine text={error} />}

      <div className="flex items-center gap-2 mt-5">
        <Button
          className="bg-indigo-600 hover:bg-indigo-700 text-white"
          onClick={() => runCommit(true)}
          disabled={loading || !requiredOk}
        >
          {loading ? <Loader2 className="size-4 mr-1 animate-spin" /> : null}
          Előnézet
        </Button>
      </div>
    </div>
  );
}

// ── Small presentational helpers ───────────────────────────────
const th: React.CSSProperties = { textAlign: "left", padding: "8px 12px", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--fg-faint)" };
const td: React.CSSProperties = { padding: "8px 12px", color: "var(--fg-soft)" };

function EntityToggle({ entity, onChange }: { entity: ImportEntity; onChange: (e: ImportEntity) => void }) {
  return (
    <div className="flex items-center gap-0.5 w-fit" style={{ background: "var(--bg-raised)", border: "1px solid var(--line-soft)", borderRadius: 8, padding: 3 }}>
      {([["company", "Cégek"], ["person", "Személyek"]] as const).map(([key, label]) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className="rounded px-4 py-1.5 text-sm font-medium transition-colors"
          style={{
            background: entity === key ? "var(--indigo-soft)" : "transparent",
            color: entity === key ? "var(--indigo)" : "var(--fg-mute)",
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="rounded-lg p-3" style={{ background: "var(--bg-raised)", border: "1px solid var(--line-soft)" }}>
      <div className="font-mono-ndt" style={{ fontSize: 22, fontWeight: 700, color: accent }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--fg-mute)" }}>{label}</div>
    </div>
  );
}

function StatusPill({ status, detail }: { status: string; detail?: string }) {
  const color = status === "új" ? "var(--mint)" : status === "hiba" ? "var(--coral)" : status === "kihagyva" ? "var(--amber)" : "var(--fg-mute)";
  return (
    <span title={detail} className="font-mono-ndt" style={{ fontSize: 11, color }}>
      {status}{detail ? ` · ${detail}` : ""}
    </span>
  );
}

function ErrorLine({ text }: { text: string }) {
  return (
    <p className="flex items-center gap-1.5 text-sm mt-3" style={{ color: "var(--coral)" }}>
      <AlertTriangle className="size-4" /> {text}
    </p>
  );
}
