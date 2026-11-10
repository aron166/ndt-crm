"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Upload, ArrowLeft, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { fieldsFor, guessMapping, type ImportEntity } from "@/lib/import/fields";
import type { ImportResult } from "@/lib/import/types";
import k from "@/components/astryx/page.module.css";
import s from "./import.module.css";

interface ParsedSheet {
  name: string;
  columns: string[];
  rows: Record<string, unknown>[];
}

const NONE = "__none__";

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
        body: JSON.stringify({ entity, mapping, rows: activeSheet.rows, dryRun, fileName }),
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
      <div className={k.card}>
        <EntityToggle entity={entity} onChange={(e) => { setEntity(e); }} />
        <label
          className={`mt-5 flex flex-col items-center justify-center gap-2 cursor-pointer rounded-lg py-10 transition-colors ${s.drop}`}
        >
          {loading ? <Loader2 className="size-6 animate-spin" style={{ color: "var(--ui-accent)" }} />
            : <Upload className="size-6" style={{ color: "var(--ui-text-muted)" }} />}
          <span className={s.dropText}>
            {loading ? "Feldolgozás…" : "Kattints a fájl kiválasztásához (.xlsx vagy .csv)"}
          </span>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="sr-only"
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
      <div className={k.card}>
        <div className="flex items-center justify-between mb-4">
          <h2 className={k.h2}>
            {done ? "Importálás kész" : "Előnézet (még nem mentett)"}
          </h2>
          {done && <CheckCircle2 className="size-5" style={{ color: "var(--mint)" }} />}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <Stat label="Új" value={r.created} accent="var(--mint)" />
          <Stat label="Meglévő" value={r.matched} accent="var(--ui-text-muted)" />
          <Stat label="Kihagyva" value={r.skipped} accent="var(--amber)" />
          <Stat label="Hiba" value={r.errors.length} accent="var(--coral)" />
        </div>
        {r.notesAppended > 0 && (
          <p className={`${k.muted} mb-3`}>
            {r.notesAppended} meglévő cégnél import megjegyzés {done ? "hozzáfűzve" : "hozzáfűzésre kerül"}.
          </p>
        )}
        {entity === "person" && (r.companiesCreated > 0 || r.contactsCreated > 0) && (
          <p className={`${k.muted} mb-3`}>
            +{r.companiesCreated} új cég, {r.contactsCreated} kapcsolat (személy ↔ cég){done ? " létrehozva" : " lesz"}.
          </p>
        )}

        <div className={k.tableWrap}>
          <table className={k.table}>
            <thead>
              <tr>
                <th>Sor</th><th>Megnevezés</th><th>Állapot</th>
              </tr>
            </thead>
            <tbody>
              {r.sample.map((row) => (
                <tr key={row.row}>
                  <td className={`${k.num} ${k.muted}`}>{row.row}</td>
                  <td>{row.label}</td>
                  <td><StatusPill status={row.status} detail={row.detail} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {r.sample.length < r.total && (
          <p className={`${k.muted} mt-2`}>Az első {r.sample.length} sor látszik a {r.total}-ból.</p>
        )}

        {error && <ErrorLine text={error} />}

        <div className="flex items-center gap-2 mt-5">
          {!done ? (
            <>
              <button type="button" onClick={() => setStep("map")} disabled={loading} className={k.btn}>
                <ArrowLeft className="size-4 mr-1" /> Vissza
              </button>
              <button
                type="button"
                className={`${k.btn} ${k.btnPrimary}`}
                onClick={() => runCommit(false)}
                disabled={loading || r.created + r.matched + r.contactsCreated === 0}
              >
                {loading ? <Loader2 className="size-4 mr-1 animate-spin" /> : null}
                Importálás véglegesítése ({r.created} új)
              </button>
            </>
          ) : (
            <>
              <Link
                href={entity === "company" ? "/companies" : "/persons"}
                className={`${k.btn} ${k.btnPrimary}`}
              >
                {entity === "company" ? "Cégek megnyitása" : "Személyek megnyitása"}
              </Link>
              <button type="button" onClick={reset} className={k.btn}>Új importálás</button>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Mapping step ─────────────────────────────────────────────
  return (
    <div className={k.card}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className={k.h2}>Oszlopok párosítása</h2>
          <p className={`${k.muted} mt-0.5`}>
            {fileName} · {activeSheet?.rows.length ?? 0} sor · {entity === "company" ? "Cégek" : "Személyek"}
          </p>
        </div>
        <button type="button" onClick={reset} className={k.btn}>Másik fájl</button>
      </div>

      {sheets && sheets.length > 1 && (
        <div className="flex items-center gap-2 mb-4">
          <span className={k.muted}>Munkalap:</span>
          <div className={k.seg}>
            {sheets.map((sh, i) => (
              <button
                key={sh.name}
                type="button"
                aria-pressed={i === sheetIdx}
                onClick={() => chooseSheet(i)}
                className={`${k.segItem} ${s.segBtn} ${i === sheetIdx ? k.segItemOn : ""}`}
              >
                {sh.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {truncated && (
        <p className="text-sm mb-3 flex items-center gap-1.5" style={{ color: "var(--amber)" }}>
          <AlertTriangle size={14} aria-hidden="true" /> A fájl több mint 10 000 sort tartalmaz: csak az első 10 000 lesz importálva.
        </p>
      )}

      <div className={k.tableWrap}>
        <table className={k.table}>
          <thead>
            <tr>
              <th>Fájl oszlop</th><th>Minta</th><th>CRM mező</th>
            </tr>
          </thead>
          <tbody>
            {activeSheet?.columns.map((col) => (
              <tr key={col}>
                <td className="font-medium">{col}</td>
                <td className={`${k.muted} truncate max-w-[180px]`}>{sampleValue(col)}</td>
                <td className={s.selectCell}>
                  <Select value={mapping[col] || NONE} onValueChange={(v) => v && setColumnField(col, v)}>
                    <SelectTrigger className={`w-full ${s.select}`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Kihagyás</SelectItem>
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
        <p className="text-sm mt-3" style={{ color: "var(--amber)" }}>
          {entity === "company"
            ? "Állítsd be, melyik oszlop a Cégnév."
            : "Állítsd be a név oszlopo(ka)t (Teljes név, vagy Vezeték- és Keresztnév)."}
        </p>
      )}
      {error && <ErrorLine text={error} />}

      <div className="flex items-center gap-2 mt-5">
        <button
          type="button"
          className={`${k.btn} ${k.btnPrimary}`}
          onClick={() => runCommit(true)}
          disabled={loading || !requiredOk}
        >
          {loading ? <Loader2 className="size-4 mr-1 animate-spin" /> : null}
          Előnézet
        </button>
      </div>
    </div>
  );
}

// ── Small presentational helpers ───────────────────────────────

function EntityToggle({ entity, onChange }: { entity: ImportEntity; onChange: (e: ImportEntity) => void }) {
  return (
    <div className={`${k.seg} w-fit`}>
      {([["company", "Cégek"], ["person", "Személyek"]] as const).map(([key, label]) => (
        <button
          key={key}
          type="button"
          aria-pressed={entity === key}
          onClick={() => onChange(key)}
          className={`${k.segItem} ${s.segBtn} ${entity === key ? k.segItemOn : ""}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className={`${k.card} ${k.stat}`}>
      <div className={k.statV} style={{ color: accent }}>{value}</div>
      <div className={k.statK}>{label}</div>
    </div>
  );
}

function StatusPill({ status, detail }: { status: string; detail?: string }) {
  const color = status === "új" ? "var(--mint)" : status === "hiba" ? "var(--coral)" : status === "kihagyva" ? "var(--amber)" : "var(--ui-text-muted)";
  return (
    <span title={detail} style={{ fontSize: 14, color }}>
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
