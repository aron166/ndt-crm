"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { EntitySearch } from "@/components/EntitySearch";
import { setCurrentEmployer } from "@/app/actions/contacts";

interface Props {
  open: boolean;
  onClose: () => void;
  personId: number;
  /** Name of the person's current employer, if any — shown so the user sees what's being replaced. */
  currentCompanyName?: string | null;
}

/**
 * Set / change a person's current employer. Two modes:
 *  - "find": pick an EXISTING company (EntitySearch),
 *  - "create": type a NEW company that isn't in the DB yet (the bug fix —
 *    previously you could only link to existing companies).
 * Either way the server closes the old employment and opens a new one,
 * preserving the career history (Person ≠ Contact).
 */
export function SetEmployerModal({ open, onClose, personId, currentCompanyName }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<"find" | "create">("find");
  const [company, setCompany] = useState<{ id: number; label: string; sub?: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  function handleClose() {
    setError(null);
    setCompany(null);
    setMode("find");
    onClose();
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("personId", String(personId));

    if (mode === "find") {
      if (!company) { setError("Válassz céget, vagy válts az 'Új cég' fülre"); return; }
      fd.set("companyId", String(company.id));
    }

    setError(null);
    startTransition(async () => {
      const res = await setCurrentEmployer(fd);
      if (res?.error) { setError(res.error); return; }
      router.refresh();
      handleClose();
    });
  }

  return (
    <div className="modal-backdrop" onClick={handleClose}>
      <div className="modal-box" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">Munkahely beállítása</span>
          <button className="modal-close" onClick={handleClose}><X style={{ width: 16, height: 16 }} /></button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {currentCompanyName && (
            <div style={{ fontSize: 12, color: "var(--fg-mute)", padding: "8px 10px", background: "var(--bg-0)", borderRadius: 6, border: "1px solid var(--line-soft)" }}>
              Jelenlegi: <span style={{ color: "var(--fg-soft)" }}>{currentCompanyName}</span> — ez lezárul, és az új lesz a jelenlegi.
            </div>
          )}

          {/* Mode toggle */}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => setMode("find")}
              className={`btn ${mode === "find" ? "primary" : ""}`} style={{ flex: 1 }}>
              Meglévő cég
            </button>
            <button type="button" onClick={() => setMode("create")}
              className={`btn ${mode === "create" ? "primary" : ""}`} style={{ flex: 1 }}>
              Új cég
            </button>
          </div>

          {mode === "find" ? (
            <div className="field-group">
              <label className="field-label">Cég keresése *</label>
              <EntitySearch
                endpoint="/api/search/companies"
                placeholder="Cég neve, adószám..."
                value={company}
                onChange={setCompany}
              />
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="field-group" style={{ gridColumn: "1 / -1" }}>
                <label className="field-label">Új cég neve *</label>
                <input name="newCompanyName" className="input-ds" placeholder="Pl. NDT Global Kft." autoFocus required={mode === "create"} />
              </div>
              <div className="field-group">
                <label className="field-label">Adószám</label>
                <input name="newCompanyVat" className="input-ds" placeholder="12345678-2-01" />
              </div>
              <div className="field-group">
                <label className="field-label">Város</label>
                <input name="newCompanyCity" className="input-ds" placeholder="Budapest" />
              </div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="field-group">
              <label className="field-label">Beosztás</label>
              <input name="role" className="input-ds" placeholder="pl. Mérnök, Vezető..." />
            </div>
            <div className="field-group">
              <label className="field-label">Kezdés dátuma</label>
              <input name="startedAt" type="date" className="input-ds" />
            </div>
          </div>

          {error && <div style={{ fontSize: 12, color: "var(--coral)", padding: "6px 10px", background: "var(--coral-soft)", borderRadius: 5 }}>{error}</div>}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 4 }}>
            <button type="button" className="btn" onClick={handleClose} disabled={pending}>Mégse</button>
            <button type="submit" className="btn primary" disabled={pending}>
              {pending ? "Mentés..." : "Mentés"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
