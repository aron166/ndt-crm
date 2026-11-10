"use client";

import { LOST_REASONS, LOST_REASON_LABEL, isLostReason } from "@/lib/leads/lifecycle";
import { useRef, useState, useTransition } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EntitySearch } from "@/components/EntitySearch";
import { updateLead } from "@/app/actions/leads";
import { FormField } from "@/components/ui/FormField";

export interface LeadEditInitial {
  id: number;
  subject?: string | null;
  serviceInterest?: string | null;
  source?: string | null;
  estimatedValue?: number | null;
  message?: string | null;
  lostReason?: string | null;
  companyId?: number | null;
  companyName?: string | null;
  campaign?: string | null;
}

interface LeadEditModalProps {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  initial: LeadEditInitial;
}

export function LeadEditModal({ open, onClose, onSaved, initial }: LeadEditModalProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [company, setCompany] = useState<{ id: number; label: string } | null>(
    initial.companyId ? { id: initial.companyId, label: initial.companyName ?? "" } : null
  );

  function handleClose() {
    setError(null);
    // Modal stays mounted (controlled by `open`); reset the company picker so a
    // changed-then-cancelled selection doesn't persist into the next open.
    setCompany(initial.companyId ? { id: initial.companyId, label: initial.companyName ?? "" } : null);
    onClose();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const form = formRef.current;
    if (!form) return;
    const data = new FormData(form);
    // A lead must keep a company; send empty so the action rejects clearing.
    data.set("companyId", company ? String(company.id) : "");

    startTransition(async () => {
      const result = await updateLead(initial.id, data);
      if (result?.error) setError(result.error);
      else { handleClose(); onSaved?.(); }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Lead szerkesztése</DialogTitle>
        </DialogHeader>

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Tárgy">
            <Input name="subject" defaultValue={initial.subject ?? ""} placeholder="Rövid tárgy" autoFocus />
          </FormField>

          <FormField label="Szolgáltatás / érdeklődés">
            <Input name="serviceInterest" defaultValue={initial.serviceInterest ?? ""} placeholder="pl. UT vizsgálat" />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Csatorna">
              <Input name="source" defaultValue={initial.source ?? ""} placeholder="pl. web, telefon, ajánlás" />
            </FormField>
            <FormField label="Becsült érték (HUF)">
              <Input type="number" name="estimatedValue" defaultValue={initial.estimatedValue ?? ""} placeholder="pl. 850000" min={0} />
            </FormField>
          </div>

          <FormField label="Cég">
            <EntitySearch endpoint="/api/search/companies" placeholder="Keresés..." value={company} onChange={setCompany} />
          </FormField>

          <FormField label="Üzenet">
            <Textarea name="message" defaultValue={initial.message ?? ""} placeholder="A lead üzenete / megjegyzés" rows={4} />
          </FormField>

          <FormField label="Elvesztés oka">
            {/* The reason is a code (Péter's list); a legacy free-text value stays selectable as is. */}
            <select name="lostReason" defaultValue={initial.lostReason ?? ""} className="input-ds">
              <option value="">-</option>
              {initial.lostReason && !isLostReason(initial.lostReason) && <option value={initial.lostReason}>{initial.lostReason}</option>}
              {LOST_REASONS.map((k) => <option key={k} value={k}>{LOST_REASON_LABEL[k]}</option>)}
            </select>
          </FormField>

          <FormField label="Kampány">
            <Input name="campaign" defaultValue={initial.campaign ?? ""} placeholder="pl. BirdsView Q3" />
          </FormField>

          {error && <p className="text-sm" style={{ color: "var(--ui-danger-text)" }}>{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={isPending}>Mégse</Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Mentés..." : "Mentés"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
