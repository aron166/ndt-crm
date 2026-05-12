"use client";

import { useRef, useState, useTransition } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { EntitySearch } from "@/components/EntitySearch";
import { createTask, updateTask } from "@/app/actions/tasks";

interface TaskFormData {
  id?: number;
  title?: string;
  type?: string | null;
  category?: string | null;
  status?: string | null;
  dueDate?: string;
  estimatedMinutes?: number | null;
  description?: string | null;
  companyId?: number | null;
  companyName?: string | null;
  personId?: number | null;
  personName?: string | null;
  parentTaskId?: number | null;
}

interface TaskModalProps {
  open: boolean;
  onClose: () => void;
  initial?: TaskFormData;
}

const TYPES = [
  { value: "call",       label: "📞 Hívás" },
  { value: "email",      label: "✉️ Email" },
  { value: "meeting",    label: "🤝 Találkozó" },
  { value: "document",   label: "📄 Dokumentum" },
  { value: "field_visit",label: "🏭 Helyszíni munka" },
  { value: "internal",   label: "⚙️ Belső" },
];

const STATUSES = [
  { value: "created",     label: "Kiírva" },
  { value: "in_progress", label: "Folyamatban" },
  { value: "done",        label: "Elvégezve" },
  { value: "cancelled",   label: "Törölve" },
];

export function TaskModal({ open, onClose, initial }: TaskModalProps) {
  const isEdit = !!initial?.id;
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [type, setType] = useState(initial?.type ?? "internal");
  const [status, setStatus] = useState(initial?.status ?? "created");
  const [company, setCompany] = useState<{ id: number; label: string } | null>(
    initial?.companyId ? { id: initial.companyId, label: initial.companyName ?? "" } : null
  );
  const [person, setPerson] = useState<{ id: number; label: string; sub?: string } | null>(
    initial?.personId ? { id: initial.personId, label: initial.personName ?? "" } : null
  );

  function handleClose() {
    setError(null);
    onClose();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const form = formRef.current;
    if (!form) return;

    const data = new FormData(form);
    data.set("type", type ?? "internal");
    data.set("status", status ?? "created");
    if (company) data.set("companyId", String(company.id));
    if (person)  data.set("personId", String(person.id));
    if (initial?.parentTaskId) data.set("parentTaskId", String(initial.parentTaskId));

    startTransition(async () => {
      const result = isEdit
        ? await updateTask(initial!.id!, data)
        : await createTask(data);
      if (result?.error) {
        setError(result.error);
      } else {
        handleClose();
        formRef.current?.reset();
      }
    });
  }

  const dueDateValue = initial?.dueDate
    ? new Date(initial.dueDate).toISOString().split("T")[0]
    : "";

  const contextLocked = !!(initial?.companyId || initial?.personId);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Feladat szerkesztése" : "Új feladat"}</DialogTitle>
        </DialogHeader>

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Cím *</label>
            <Input
              name="title"
              defaultValue={initial?.title}
              placeholder="Feladat megnevezése"
              required
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Típus</label>
              <Select value={type ?? "internal"} onValueChange={(v) => v && setType(v)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Határidő</label>
              <Input type="date" name="dueDate" defaultValue={dueDateValue} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Tervezett perc</label>
              <Input
                type="number"
                name="estimatedMinutes"
                defaultValue={initial?.estimatedMinutes ?? ""}
                placeholder="pl. 30"
                min={1}
              />
            </div>
            {isEdit && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Státusz</label>
                <Select value={status ?? "created"} onValueChange={(v) => v && setStatus(v)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Leírás</label>
            <Textarea
              name="description"
              defaultValue={initial?.description ?? ""}
              placeholder="Megjegyzések..."
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Cég</label>
              <EntitySearch
                endpoint="/api/search/companies"
                placeholder="Keresés..."
                value={company}
                onChange={setCompany}
                disabled={contextLocked && !!initial?.companyId}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Személy</label>
              <EntitySearch
                endpoint="/api/search/persons"
                placeholder="Keresés..."
                value={person}
                onChange={setPerson}
                disabled={contextLocked && !!initial?.personId}
              />
            </div>
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
              {isPending ? "Mentés..." : isEdit ? "Mentés" : "Létrehozás"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
