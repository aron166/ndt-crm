"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { createQuote, searchCompaniesForQuote } from "@/app/actions/quotes";

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "7px 10px", fontSize: 13,
  background: "var(--bg-0)", border: "1px solid var(--line-soft)",
  borderRadius: 6, color: "var(--fg)", outline: "none",
};

interface Props {
  /** When set, the quote is for this company and the picker is hidden. */
  presetCompany?: { id: number; name: string };
  /** Origin lead, if quoting from a lead. */
  leadId?: number;
  triggerLabel?: string;
  triggerClassName?: string;
}

export function NewQuoteDialog({ presetCompany, leadId, triggerLabel = "+ Új árajánlat", triggerClassName = "btn primary" }: Props) {
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
            {presetCompany ? presetCompany.name : "Válaszd ki a céget"} — a tételeket a következő lépésben adod meg.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {!presetCompany && (
            <div>
              <label style={{ fontSize: 11, color: "var(--fg-faint)" }}>Cég</label>
              {companyId ? (
                <div className="flex items-center justify-between gap-2 mt-1" style={inputStyle}>
                  <span>{companyLabel}</span>
                  <button type="button" style={{ color: "var(--fg-faint)", fontSize: 12 }}
                    onClick={() => { setCompanyId(null); setCompanyLabel(""); setQuery(""); }}>módosít</button>
                </div>
              ) : (
                <div className="relative mt-1">
                  <input style={inputStyle} value={query} autoFocus
                    onChange={(e) => setQuery(e.target.value)} placeholder="Cég keresése…" />
                  {results.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-md"
                      style={{ background: "var(--bg-panel)", border: "1px solid var(--line-soft)" }}>
                      {results.map((c) => (
                        <button key={c.id} type="button"
                          className="block w-full text-left px-3 py-2 hover:bg-[var(--bg-0)]"
                          style={{ fontSize: 13 }}
                          onClick={() => { setCompanyId(c.id); setCompanyLabel(c.name); setResults([]); }}>
                          {c.name}{c.city ? <span style={{ color: "var(--fg-faint)" }}> · {c.city}</span> : null}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div>
            <label style={{ fontSize: 11, color: "var(--fg-faint)" }}>Tárgy</label>
            <input style={{ ...inputStyle, marginTop: 4 }} value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="pl. Hegesztési varratok UT vizsgálata" />
          </div>

          {error && <span style={{ fontSize: 12, color: "var(--coral)" }}>⚠ {error}</span>}

          <div className="flex justify-end gap-2 mt-1">
            <button className="btn" onClick={() => setOpen(false)} disabled={pending}>Mégse</button>
            <button className="btn primary" onClick={handleSubmit} disabled={pending}>
              {pending ? "Létrehozás…" : "Létrehozás"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
