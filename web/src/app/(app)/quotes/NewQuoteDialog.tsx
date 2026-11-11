"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import {
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { createQuote, searchCompaniesForQuote } from "@/app/actions/quotes";
import k from "@/components/astryx/page.module.css";
import q from "./quotes.module.css";
import { FormField } from "@/components/ui/FormField";

interface Props {
  /** When set, the quote is for this company and the picker is hidden. */
  presetCompany?: { id: number; name: string };
  /** Origin lead, if quoting from a lead. */
  leadId?: number;
  triggerLabel?: string;
  triggerClassName?: string;
}

export function NewQuoteDialog({ presetCompany, leadId, triggerLabel = "+ Új árajánlat", triggerClassName = `${k.btn} ${k.btnPrimary}` }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Company picker (only when no preset).
  const [companyId, setCompanyId] = useState<number | null>(presetCompany?.id ?? null);
  const [companyLabel, setCompanyLabel] = useState(presetCompany?.name ?? "");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Array<{ id: number; name: string; city: string | null }>>([]);

  useEffect(() => {
    if (presetCompany || companyId) return;
    const q = query.trim();
    if (q.length < 1) { setResults([]); return; }
    let active = true;
    const t = setTimeout(() => {
      searchCompaniesForQuote(q).then((r) => { if (active) setResults(r); }).catch(() => {});
    }, 200);
    return () => { active = false; clearTimeout(t); };
  }, [query, companyId, presetCompany]);

  function reset() {
    setTitle(""); setError(null);
    if (!presetCompany) { setCompanyId(null); setCompanyLabel(""); setQuery(""); setResults([]); }
  }

  function handleSubmit() {
    setError(null);
    if (!companyId) { setError("Válassz céget"); return; }
    if (!title.trim()) { setError("Adj meg tárgyat"); return; }
    startTransition(async () => {
      const res = await createQuote({
        companyId, title: title.trim(), vatRate: 27, lines: [],
        leadId: leadId ?? null,
      });
      if ("error" in res) { setError(res.error); return; }
      setOpen(false);
      router.push(`/quotes/${res.id}`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger render={<button className={triggerClassName} />}>{triggerLabel}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Új árajánlat</DialogTitle>
          <DialogDescription>
            {presetCompany ? presetCompany.name : "Válaszd ki a céget"}: a tételeket a következő lépésben adod meg.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {!presetCompany && (
            <FormField label="Cég">
              {companyId ? (
                <div className={`flex items-center justify-between gap-2 mt-1 ${q.input}`}>
                  <span>{companyLabel}</span>
                  <button type="button" style={{ color: "var(--ui-text-muted)", fontSize: 14 }}
                    onClick={() => { setCompanyId(null); setCompanyLabel(""); setQuery(""); }}>módosít</button>
                </div>
              ) : (
                <div className="relative mt-1">
                  <input className={q.input} value={query} autoFocus
                    onChange={(e) => setQuery(e.target.value)} placeholder="Cég keresése…" />
                  {results.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full overflow-hidden"
                      style={{ background: "var(--ui-surface)", border: "1px solid var(--ui-border)", borderRadius: "var(--ui-radius-control)", boxShadow: "var(--ui-shadow-overlay)" }}>
                      {results.map((c) => (
                        <button key={c.id} type="button"
                          className="block w-full text-left px-3 py-2 hover:bg-[var(--ui-hover)]"
                          style={{ fontSize: 14, minHeight: 40 }}
                          onClick={() => { setCompanyId(c.id); setCompanyLabel(c.name); setResults([]); }}>
                          {c.name}{c.city ? <span style={{ color: "var(--ui-text-muted)" }}> · {c.city}</span> : null}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </FormField>
          )}

          <FormField label="Tárgy">
            <input className={q.input} style={{ marginTop: 4 }} value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="pl. Hegesztési varratok UT vizsgálata" />
          </FormField>

          {error && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 14, color: "var(--ui-danger-text)" }}>
              <AlertTriangle size={14} aria-hidden="true" /> {error}
            </span>
          )}

          <div className="flex justify-end gap-2 mt-1">
            <button className={k.btn} onClick={() => setOpen(false)} disabled={pending}>Mégse</button>
            <button className={`${k.btn} ${k.btnPrimary}`} onClick={handleSubmit} disabled={pending}>
              {pending ? "Létrehozás…" : "Létrehozás"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
