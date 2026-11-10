"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPerson } from "@/app/actions/persons";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/FormField";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CreatePersonModal({ open, onClose }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data = {
      firstName:   fd.get("firstName") as string,
      lastName:    fd.get("lastName") as string,
      email:       fd.get("email") as string,
      phone:       fd.get("phone") as string,
      linkedinUrl: fd.get("linkedinUrl") as string,
      notes:       fd.get("notes") as string,
    };
    setError(null);
    startTransition(async () => {
      const res = await createPerson(data);
      if (res.error) { setError(res.error); return; }
      onClose();
      if (res.id) router.push(`/persons/${res.id}`);
      else router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Új személy</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <FormField label="Vezetéknév" required>
              <Input name="lastName" placeholder="Kovács" required autoFocus />
            </FormField>
            <FormField label="Keresztnév" required>
              <Input name="firstName" placeholder="Béla" required />
            </FormField>
            <FormField label="Email">
              <Input name="email" placeholder="kovacs.bela@ceg.hu" type="email" />
            </FormField>
            <FormField label="Telefon">
              <Input name="phone" placeholder="+36 30 123 4567" type="tel" />
            </FormField>
            <FormField label="LinkedIn URL" full>
              <Input name="linkedinUrl" placeholder="https://linkedin.com/in/..." type="url" />
            </FormField>
            <FormField label="Megjegyzés" full>
              <Textarea name="notes" rows={2} />
            </FormField>
          </div>

          {error && <div style={{ fontSize: 14, color: "var(--ui-danger-text)", padding: "6px 10px", background: "var(--ui-danger-surface)", borderRadius: "var(--ui-radius-control)" }}>{error}</div>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>Mégse</Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Mentés..." : "Személy létrehozása"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
