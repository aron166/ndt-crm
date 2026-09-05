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
import { FormField } from "@/components/ui/FormField";

interface CustomField {
  id: number; key: string; label: string; type: string;
  required: boolean; options: unknown;
}

interface Pipeline {
  id: number;
  stages: { id: number; name: string; color: string; isTerminalWon: boolean; isTerminalLost: boolean }[];
  customFields: CustomField[];
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
  customFieldValues?: Record<string, string>;
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
          <FormField label="Cím" required>
            <Input name="title" defaultValue={initial?.title} placeholder="Deal megnevezése" required autoFocus />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Fázis">
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
            </FormField>
            <FormField label="Érték (HUF)">
              <Input type="number" name="value" defaultValue={initial?.value} placeholder="pl. 850000" min={0} />
            </FormField>
          </div>

          <FormField label="Cég" required>
            <EntitySearch endpoint="/api/search/companies" placeholder="Keresés..." value={company} onChange={setCompany} />
          </FormField>

          <FormField label="Kapcsolattartó">
            <EntitySearch endpoint="/api/search/persons" placeholder="Keresés..." value={person} onChange={setPerson} />
          </FormField>

          <FormField label="Várható zárás">
            <Input type="date" name="expectedCloseDate" defaultValue={initial?.expectedCloseDate} />
          </FormField>

          {/* Dynamic custom fields */}
          {pipeline.customFields.length > 0 && (
            <div style={{ borderTop: "1px solid var(--line-soft)", paddingTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--fg-faint)", marginBottom: 10 }}>
                Egyéni mezők
              </div>
              <div className="space-y-3">
                {pipeline.customFields.map((f) => {
                  const savedVal = initial?.customFieldValues?.[f.key] ?? "";
                  const opts = Array.isArray(f.options) ? (f.options as string[]) : [];
                  return (
                    <FormField key={f.key} label={f.label} required={f.required}>
                      {f.type === "text" && (
                        <Input name={`cf_${f.key}`} defaultValue={savedVal} required={f.required} />
                      )}
                      {f.type === "number" && (
                        <Input type="number" name={`cf_${f.key}`} defaultValue={savedVal} required={f.required} />
                      )}
                      {f.type === "date" && (
                        <Input type="date" name={`cf_${f.key}`} defaultValue={savedVal} required={f.required} />
                      )}
                      {f.type === "single_select" && opts.length > 0 && (
                        <select
                          name={`cf_${f.key}`}
                          defaultValue={savedVal}
                          required={f.required}
                          style={{ width: "100%", padding: "6px 8px", background: "var(--bg-0)", border: "1px solid var(--line-soft)", borderRadius: 6, color: "var(--fg)", fontSize: 14, outline: "none" }}
                        >
                          <option value="">—</option>
                          {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      )}
                      {f.type === "multi_select" && opts.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-1">
                          {opts.map((o) => {
                            const checked = savedVal.split(",").includes(o);
                            return (
                              <label key={o} className="flex items-center gap-1.5 cursor-pointer" style={{ fontSize: 14, color: "var(--fg-soft)" }}>
                                <input type="checkbox" name={`cf_${f.key}[]`} value={o} defaultChecked={checked} />
                                {o}
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </FormField>
                  );
                })}
              </div>
            </div>
          )}

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
