"use client";

import { useState, useTransition } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/FormField";

interface Props {
  open: boolean;
  personName: string;
  companyName: string;
  onConfirm: (endedAt: Date) => void;
  onClose: () => void;
}

export function LeaveCompanyModal({ open, personName, companyName, onConfirm, onClose }: Props) {
  const today = new Date().toISOString().split("T")[0];
  const [date, setDate] = useState(today);
  const [pending, start] = useTransition();

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Kilépés rögzítése</DialogTitle>
        </DialogHeader>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <p style={{ margin: 0, fontSize: 14, color: "var(--ui-text-muted)" }}>
            <strong style={{ color: "var(--ui-text)" }}>{personName}</strong> mikor hagyta el a(z){" "}
            <strong style={{ color: "var(--ui-text)" }}>{companyName}</strong> céget?
          </p>
          <FormField label="Kilépés dátuma">
            <Input
              type="date"
              value={date}
              max={today}
              onChange={(e) => setDate(e.target.value)}
            />
          </FormField>
          <p style={{ margin: 0, fontSize: 12, color: "var(--ui-text-muted)" }}>
            Egy „Utánkövetés" feladat automatikusan létrejön 2 hetes határidővel.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>Mégse</Button>
            <Button
              type="button"
              disabled={pending || !date}
              onClick={() => start(() => { onConfirm(new Date(date)); })}
            >
              {pending ? "Mentés..." : "Rögzítés"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
