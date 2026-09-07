"use client";

import { useRef, useState, useTransition } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { sendCrmEmail } from "@/app/actions/email";
import { FormField } from "@/components/ui/FormField";

interface SendEmailModalProps {
  open: boolean;
  onClose: () => void;
  companyId?: number | null;
  personId?: number | null;
  defaultTo?: string;
  contextLabel?: string;
}

export function SendEmailModal({
  open, onClose, companyId, personId, defaultTo, contextLabel,
}: SendEmailModalProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClose() {
    setError(null);
    onClose();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    setError(null);
    startTransition(async () => {
      const res = await sendCrmEmail({
        to: (fd.get("to") as string) ?? "",
        subject: (fd.get("subject") as string) ?? "",
        text: (fd.get("text") as string) ?? "",
        companyId: companyId ?? null,
        personId: personId ?? null,
      });
      if (res?.error) { setError(res.error); return; }
      handleClose();
      formRef.current?.reset();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Email küldése</DialogTitle>
          {contextLabel && <p className="text-sm text-slate-500">{contextLabel}</p>}
        </DialogHeader>

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Címzett" required>
            <Input name="to" type="email" defaultValue={defaultTo ?? ""} placeholder="nev@ceg.hu" required autoFocus={!defaultTo} />
          </FormField>
          <FormField label="Tárgy" required>
            <Input name="subject" placeholder="Tárgy" required autoFocus={!!defaultTo} />
          </FormField>
          <FormField label="Üzenet" required>
            <Textarea name="text" rows={8} placeholder="Írd meg az üzenetet..." required />
          </FormField>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={isPending}>Mégse</Button>
            <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white" disabled={isPending}>
              {isPending ? "Küldés..." : "Küldés"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
