"use client";

import { useState, useTransition } from "react";
import { updatePerson } from "@/app/actions/persons";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/FormField";

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
            <FormField label="Vezetéknév" required>
              <Input name="lastName" defaultValue={person.lastName ?? ""} required />
            </FormField>
            <FormField label="Keresztnév" required>
              <Input name="firstName" defaultValue={person.firstName ?? ""} required />
            </FormField>
            <FormField label="Email">
              <Input name="email" defaultValue={person.email ?? ""} type="email" />
            </FormField>
            <FormField label="Telefon">
              <Input name="phone" defaultValue={person.phone ?? ""} type="tel" />
            </FormField>
            <FormField label="LinkedIn URL" full>
              <Input name="linkedinUrl" defaultValue={person.linkedinUrl ?? ""} />
            </FormField>
            <FormField label="Megjegyzés" full>
              <Textarea name="notes" rows={3} defaultValue={person.notes ?? ""} />
            </FormField>
          </div>

          {error && <div style={{ fontSize: 14, color: "var(--ui-danger-text)", padding: "6px 10px", background: "var(--ui-danger-surface)", borderRadius: "var(--ui-radius-control)" }}>{error}</div>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>Mégse</Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Mentés..." : "Mentés"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
