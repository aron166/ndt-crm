"use client";

import { useRef, useState, useTransition } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { EntitySearch } from "@/components/EntitySearch";
import { createDeal, updateDeal } from "@/app/actions/deals";

interface Pipeline {
  id: number;
  stages: { id: number; name: string; color: string; isTerminalWon: boolean; isTerminalLost: boolean }[];
}

interface DealFormData {
  id?: number;
  title?: string;
  value?: string;
  stageId?: number;
  companyId?: number;
  companyName?: string;
  personId?: number;
  personName?: string;
  expectedCloseDate?: string;
}

interface DealModalProps {
  open: boolean;
  onClose: () => void;
  pipeline: Pipeline;
  initial?: DealFormData;
}

export function DealModal({ open, onClose, pipeline, initial }: DealModalProps) {
  const isEdit = !!initial?.id;
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [stageId, setStageId] = useState<string>(
    initial?.stageId ? String(initial.stageId)
      : String(pipeline.stages.find((s) => !s.isTerminalWon && !s.isTerminalLost)?.id ?? pipeline.stages[0]?.id ?? "")
  );
  const [company, setCompany] = useState<{ id: number; label: string } | null>(
    initial?.companyId ? { id: initial.companyId, label: initial.companyName ?? "" } : null
  );
  const [person, setPerson] = useState<{ id: number; label: string; sub?: string } | null>(
    initial?.personId ? { id: initial.personId, label: initial.personName ?? "" } : null
  );

  function handleClose() { setError(null); onClose(); }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const form = formRef.current;
    if (!form) return;
    const data = new FormData(form);
    data.set("pipelineId", String(pipeline.id));
    data.set("stageId", stageId);
    if (company) data.set("companyId", String(company.id));
    if (person)  data.set("personId", String(person.id));

    startTransition(async () => {
      const result = isEdit
        ? await updateDeal(initial!.id!, data)
        : await createDeal(data);
      if (result?.error) setError(result.error);
      else handleClose();
    });
  }

  const activeStages = pipeline.stages.filter((s) => !s.isTerminalWon && !s.isTerminalLost);
  const terminalStages = pipeline.stages.filter((s) => s.isTerminalWon || s.isTerminalLost);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Deal szerkesztése" : "Új deal"}</DialogTitle>
        </DialogHeader>

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="field-label">Cím *</label>
            <Input name="title" defaultValue={initial?.title} placeholder="Deal megnevezése" required autoFocus />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Fázis</label>
              <Select value={stageId} onValueChange={(v) => v && setStageId(v)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {activeStages.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      <span className="flex items-center gap-2">
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.color, flexShrink: 0, display: "inline-block" }} />
                        {s.name}
                      </span>
                    </SelectItem>
                  ))}
                  {terminalStages.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      <span className="flex items-center gap-2">
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.color, flexShrink: 0, display: "inline-block" }} />
                        {s.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="field-label">Érték (HUF)</label>
              <Input type="number" name="value" defaultValue={initial?.value} placeholder="pl. 850000" min={0} />
            </div>
          </div>

          <div>
            <label className="field-label">Cég *</label>
            <EntitySearch endpoint="/api/search/companies" placeholder="Keresés..." value={company} onChange={setCompany} />
          </div>

          <div>
            <label className="field-label">Kapcsolattartó</label>
            <EntitySearch endpoint="/api/search/persons" placeholder="Keresés..." value={person} onChange={setPerson} />
          </div>

          <div>
            <label className="field-label">Várható zárás</label>
            <Input type="date" name="expectedCloseDate" defaultValue={initial?.expectedCloseDate} />
          </div>

          {error && <p className="text-sm" style={{ color: "var(--coral)" }}>{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={isPending}>Mégse</Button>
            <Button type="submit" className="btn primary" disabled={isPending}>
              {isPending ? "Mentés..." : isEdit ? "Mentés" : "Létrehozás"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
