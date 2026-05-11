"use client";

import { useRef, useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { logInteraction } from "@/app/actions/interactions";

const TYPES = [
  { value: "call", label: "📞 Telefonhívás" },
  { value: "email", label: "✉️ Email" },
  { value: "meeting", label: "🤝 Találkozó" },
  { value: "site_visit", label: "🏭 Helyszíni látogatás" },
  { value: "note", label: "📝 Megjegyzés" },
];

const DIRECTIONS = [
  { value: "outbound", label: "Kimenő (mi hívtuk)" },
  { value: "inbound", label: "Bejövő (ők hívtak)" },
];

interface LogInteractionModalProps {
  open: boolean;
  onClose: () => void;
  companyId?: number | null;
  personId?: number | null;
  companyName?: string;
  personName?: string;
}

function nowLocalIso() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export function LogInteractionModal({
  open,
  onClose,
  companyId,
  personId,
  companyName,
  personName,
}: LogInteractionModalProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState("call");
  const [direction, setDirection] = useState("outbound");

  function handleClose() {
    setError(null);
    setType("call");
    setDirection("outbound");
    onClose();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const form = formRef.current;
    if (!form) return;

    const data = new FormData(form);
    data.set("type", type);
    data.set("direction", direction);
    if (companyId) data.set("companyId", String(companyId));
    if (personId) data.set("personId", String(personId));

    startTransition(async () => {
      const result = await logInteraction(data);
      if (result?.error) {
        setError(result.error);
      } else {
        handleClose();
      }
    });
  }

  const contextLabel = personName
    ? `${personName}${companyName ? ` · ${companyName}` : ""}`
    : companyName;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Interakció naplózása</DialogTitle>
          {contextLabel && (
            <p className="text-sm text-slate-500">{contextLabel}</p>
          )}
        </DialogHeader>

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Típus *
              </label>
              <Select value={type} onValueChange={(v) => v && setType(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Irány
              </label>
              <Select
                value={direction}
                onValueChange={(v) => v && setDirection(v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DIRECTIONS.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Megjegyzés *
            </label>
            <Textarea
              name="notes"
              placeholder="Mi hangzott el? Mi a következő lépés?"
              rows={4}
              required
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Eredmény / státusz
              </label>
              <Input
                name="outcome"
                placeholder="pl. visszahív, érdeklődő..."
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Időpont *
              </label>
              <Input
                type="datetime-local"
                name="occurredAt"
                defaultValue={nowLocalIso()}
                required
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isPending}
            >
              Mégse
            </Button>
            <Button
              type="submit"
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
              disabled={isPending}
            >
              {isPending ? "Mentés..." : "Naplózás"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
