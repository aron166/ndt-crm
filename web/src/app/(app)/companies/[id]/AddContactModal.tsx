"use client";

import { useRef, useState, useTransition } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EntitySearch } from "@/components/EntitySearch";
import { addContact, createPersonAndLink } from "@/app/actions/contacts";
import { useRouter } from "next/navigation";
import { FormField } from "@/components/ui/FormField";

interface AddContactModalProps {
  open: boolean;
  onClose: () => void;
  companyId: number;
}

export function AddContactModal({ open, onClose, companyId }: AddContactModalProps) {
  const router = useRouter();
  const [mode, setMode] = useState<"find" | "create">("find");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [person, setPerson] = useState<{ id: number; label: string; sub?: string } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function handleClose() {
    setError(null);
    setPerson(null);
    setMode("find");
    onClose();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const form = formRef.current;
    if (!form) return;

    const data = new FormData(form);
    data.set("companyId", String(companyId));

    startTransition(async () => {
      if (mode === "find") {
        if (!person) { setError("Válassz személyt"); return; }
        data.set("personId", String(person.id));
        const result = await addContact(data);
        if (result?.error) { setError(result.error); return; }
      } else {
        const result = await createPersonAndLink(data);
        if (result?.error) { setError(result.error); return; }
      }
      router.refresh();
      handleClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Kapcsolat hozzáadása</DialogTitle>
        </DialogHeader>

        <div className="flex gap-0.5 p-[3px] mb-4 rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-muted)]">
          <button
            type="button"
            onClick={() => setMode("find")}
            className={`flex-1 min-h-11 sm:min-h-9 rounded-[var(--ui-radius-control)] text-sm font-medium transition-colors ${
              mode === "find"
                ? "bg-[var(--ui-surface)] text-[var(--ui-text)] shadow-[var(--ui-shadow-raised)]"
                : "text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]"
            }`}
          >
            Meglévő személy
          </button>
          <button
            type="button"
            onClick={() => setMode("create")}
            className={`flex-1 min-h-11 sm:min-h-9 rounded-[var(--ui-radius-control)] text-sm font-medium transition-colors ${
              mode === "create"
                ? "bg-[var(--ui-surface)] text-[var(--ui-text)] shadow-[var(--ui-shadow-raised)]"
                : "text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]"
            }`}
          >
            Új személy
          </button>
        </div>

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
          {mode === "find" ? (
            <FormField label="Személy keresése" required>
              <EntitySearch
                endpoint="/api/search/persons"
                placeholder="Név, email..."
                value={person}
                onChange={setPerson}
              />
            </FormField>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormField label="Keresztnév">
                  <Input name="firstName" placeholder="Béla" autoFocus />
                </FormField>
                <FormField label="Vezetéknév">
                  <Input name="lastName" placeholder="Kovács" />
                </FormField>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormField label="Email">
                  <Input name="email" type="email" placeholder="bela@ceg.hu" />
                </FormField>
                <FormField label="Telefon">
                  <Input name="phone" placeholder="+36 30..." />
                </FormField>
              </div>
            </>
          )}

          <FormField label="Beosztás">
            <Input name="role" placeholder="pl. Mérnök, Vezető..." />
          </FormField>

          {error && <p style={{ color: "var(--ui-danger-text)" }} className="text-sm">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={isPending}>
              Mégse
            </Button>
            <Button
              type="submit"
              disabled={isPending}
            >
              {isPending ? "Mentés..." : "Hozzáadás"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
