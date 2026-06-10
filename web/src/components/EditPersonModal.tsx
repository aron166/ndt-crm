"use client";

import { useState, useTransition } from "react";
import { updatePerson } from "@/app/actions/persons";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Person {
  id: number; firstName: string | null; lastName: string | null;
  email: string | null; phone: string | null;
  linkedinUrl?: string | null; notes: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  person: Person;
}

export function EditPersonModal({ open, onClose, person }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const res = await updatePerson(person.id, {
        firstName:   fd.get("firstName") as string,
        lastName:    fd.get("lastName") as string,
        email:       fd.get("email") as string,
        phone:       fd.get("phone") as string,
        linkedinUrl: fd.get("linkedinUrl") as string,
        notes:       fd.get("notes") as string,
      });
      if (res.error) { setError(res.error); return; }
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Személy szerkesztése</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="field-group">
              <label className="field-label">Vezetéknév *</label>
              <input name="lastName" className="input-ds" defaultValue={person.lastName ?? ""} required />
            </div>
            <div className="field-group">
              <label className="field-label">Keresztnév *</label>
              <input name="firstName" className="input-ds" defaultValue={person.firstName ?? ""} required />
            </div>
            <div className="field-group">
              <label className="field-label">Email</label>
              <input name="email" className="input-ds" defaultValue={person.email ?? ""} type="email" />
            </div>
            <div className="field-group">
              <label className="field-label">Telefon</label>
              <input name="phone" className="input-ds" defaultValue={person.phone ?? ""} type="tel" />
            </div>
            <div className="field-group" style={{ gridColumn: "1 / -1" }}>
              <label className="field-label">LinkedIn URL</label>
              <input name="linkedinUrl" className="input-ds" defaultValue={person.linkedinUrl ?? ""} />
            </div>
            <div className="field-group" style={{ gridColumn: "1 / -1" }}>
              <label className="field-label">Megjegyzés</label>
              <textarea name="notes" className="input-ds" rows={3} defaultValue={person.notes ?? ""} style={{ resize: "vertical" }} />
            </div>
          </div>

          {error && <div style={{ fontSize: 12, color: "var(--coral)", padding: "6px 10px", background: "var(--coral-soft)", borderRadius: 5 }}>{error}</div>}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 4 }}>
            <button type="button" className="btn" onClick={onClose} disabled={pending}>Mégse</button>
            <button type="submit" className="btn primary" disabled={pending}>
              {pending ? "Mentés..." : "Mentés"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
