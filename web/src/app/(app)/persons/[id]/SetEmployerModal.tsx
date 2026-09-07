"use client";

import { useRef, useState, useTransition } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EntitySearch } from "@/components/EntitySearch";
import { setCurrentEmployer } from "@/app/actions/contacts";
import { useRouter } from "next/navigation";
import { FormField } from "@/components/ui/FormField";

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
 *  - "create": type a NEW company that isn't in the DB yet.
 * Either way the server closes the old employment and opens a new one,
 * preserving the career history (Person ≠ Contact).
 */
export function SetEmployerModal({ open, onClose, personId, currentCompanyName }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<"find" | "create">("find");
  const [company, setCompany] = useState<{ id: number; label: string; sub?: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function handleClose() {
    setError(null);
    setCompany(null);
    setMode("find");
    onClose();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const form = formRef.current;
    if (!form) return;

    const data = new FormData(form);
    data.set("personId", String(personId));

    if (mode === "find") {
      if (!company) { setError("Válassz céget, vagy válts az 'Új cég' fülre"); return; }
      data.set("companyId", String(company.id));
    }

    setError(null);
    startTransition(async () => {
      try {
        const res = await setCurrentEmployer(data);
        if (res?.error) { setError(res.error); return; }
        router.refresh();
        handleClose();
      } catch {
        setError("Mentés közben hiba történt. Próbáld újra.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !isPending && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Munkahely beállítása</DialogTitle>
        </DialogHeader>

        {currentCompanyName && (
          <p className="text-xs text-slate-500 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            Jelenlegi: <span className="text-slate-700 font-medium">{currentCompanyName}</span> — ez lezárul, és az új lesz a jelenlegi.
          </p>
        )}

        <div className="flex gap-2 mb-1">
          <button
            type="button"
            onClick={() => setMode("find")}
            className={`flex-1 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
              mode === "find"
                ? "bg-indigo-600 text-white border-indigo-600"
                : "border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            Meglévő cég
          </button>
          <button
            type="button"
            onClick={() => setMode("create")}
            className={`flex-1 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
              mode === "create"
                ? "bg-indigo-600 text-white border-indigo-600"
                : "border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            Új cég
          </button>
        </div>

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
          {mode === "find" ? (
            <FormField label="Cég keresése" required>
              <EntitySearch
                endpoint="/api/search/companies"
                placeholder="Cég neve, adószám..."
                value={company}
                onChange={setCompany}
              />
            </FormField>
          ) : (
            <>
              <FormField label="Új cég neve" required>
                <Input name="newCompanyName" placeholder="Pl. NDT Global Kft." autoFocus required={mode === "create"} />
              </FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Adószám">
                  <Input name="newCompanyVat" placeholder="12345678-2-01" />
                </FormField>
                <FormField label="Város">
                  <Input name="newCompanyCity" placeholder="Budapest" />
                </FormField>
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Beosztás">
              <Input name="role" placeholder="pl. Mérnök, Vezető..." />
            </FormField>
            <FormField label="Kezdés dátuma">
              <Input name="startedAt" type="date" />
            </FormField>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={isPending}>
              Mégse
            </Button>
            <Button
              type="submit"
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
              disabled={isPending}
            >
              {isPending ? "Mentés..." : "Mentés"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
