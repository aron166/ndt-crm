"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export interface DeleteCascade {
  company: boolean;
  person: boolean;
}

interface Props {
  open: boolean;
  /** What kind of card is being deleted — only changes the wording. */
  kind: "lead" | "deal";
  /** Card label shown in the prompt (service interest / deal title). */
  label: string;
  company?: { name: string } | null;
  person?: { name: string } | null;
  onConfirm: (cascade: DeleteCascade) => void;
  onClose: () => void;
}

export function DeleteCardDialog({ open, kind, label, company, person, onConfirm, onClose }: Props) {
  const [delCompany, setDelCompany] = useState(false);
  const [delPerson, setDelPerson] = useState(false);

  // Reset the cascade choices whenever a fresh card is opened.
  useEffect(() => {
    if (open) { setDelCompany(false); setDelPerson(false); }
  }, [open]);

  const cardWord = kind === "lead" ? "lead-kártyát" : "deal-t";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{kind === "lead" ? "Lead-kártya törlése" : "Deal törlése"}</DialogTitle>
        </DialogHeader>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <p style={{ margin: 0, fontSize: 13, color: "var(--fg-soft)" }}>
            Biztosan törlöd ezt a {cardWord}: <strong style={{ color: "var(--fg)" }}>{label}</strong>?
          </p>

          {(company || person) && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <p style={{ margin: 0, fontSize: 11, color: "var(--fg-faint)" }}>
                Alapból csak a kártya tűnik el. Opcionálisan a kapcsolódó rekordok is törölhetők
                (visszaállíthatók):
              </p>
              {company && (
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--fg-soft)" }}>
                  <input type="checkbox" checked={delCompany} onChange={(e) => setDelCompany(e.target.checked)} />
                  A(z) <strong style={{ color: "var(--fg)" }}>{company.name}</strong> cég törlése is
                </label>
              )}
              {person && (
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--fg-soft)" }}>
                  <input type="checkbox" checked={delPerson} onChange={(e) => setDelPerson(e.target.checked)} />
                  <strong style={{ color: "var(--fg)" }}>{person.name}</strong> személy törlése is
                </label>
              )}
            </div>
          )}

          <p style={{ margin: 0, fontSize: 11, color: "var(--fg-faint)" }}>
            Az interakciók megmaradnak (csak hozzáfűzhető napló).
            {delCompany && " A cég minden más kapcsolatából is eltűnik — később visszaállítható."}
          </p>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="btn" onClick={onClose}>Mégse</button>
            <button
              className="btn"
              style={{ background: "var(--coral)", color: "#fff", borderColor: "var(--coral)" }}
              onClick={() => onConfirm({ company: delCompany, person: delPerson })}
            >
              Törlés
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
