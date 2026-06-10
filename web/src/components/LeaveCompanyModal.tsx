"use client";

import { useState, useTransition } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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
          <p style={{ margin: 0, fontSize: 13, color: "var(--fg-soft)" }}>
            <strong style={{ color: "var(--fg)" }}>{personName}</strong> mikor hagyta el a(z){" "}
            <strong style={{ color: "var(--fg)" }}>{companyName}</strong> céget?
          </p>
          <div className="field-group">
            <label className="field-label">Kilépés dátuma</label>
            <input
              type="date"
              className="input-ds"
              value={date}
              max={today}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <p style={{ margin: 0, fontSize: 11, color: "var(--fg-faint)" }}>
            Egy „Utánkövetés" feladat automatikusan létrejön 2 hetes határidővel.
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="btn" onClick={onClose} disabled={pending}>Mégse</button>
            <button
              className="btn primary"
              disabled={pending || !date}
              onClick={() => start(() => { onConfirm(new Date(date)); })}
            >
              {pending ? "Mentés..." : "Rögzítés"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
