"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPerson } from "@/app/actions/persons";
import { X } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CreatePersonModal({ open, onClose }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

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
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">Új személy</span>
          <button className="modal-close" onClick={onClose}><X style={{ width: 16, height: 16 }} /></button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="field-group">
              <label className="field-label">Vezetéknév *</label>
              <input name="lastName" className="input-ds" placeholder="Kovács" required autoFocus />
            </div>
            <div className="field-group">
              <label className="field-label">Keresztnév *</label>
              <input name="firstName" className="input-ds" placeholder="Béla" required />
            </div>
            <div className="field-group">
              <label className="field-label">Email</label>
              <input name="email" className="input-ds" placeholder="kovacs.bela@ceg.hu" type="email" />
            </div>
            <div className="field-group">
              <label className="field-label">Telefon</label>
              <input name="phone" className="input-ds" placeholder="+36 30 123 4567" type="tel" />
            </div>
            <div className="field-group" style={{ gridColumn: "1 / -1" }}>
              <label className="field-label">LinkedIn URL</label>
              <input name="linkedinUrl" className="input-ds" placeholder="https://linkedin.com/in/..." type="url" />
            </div>
            <div className="field-group" style={{ gridColumn: "1 / -1" }}>
              <label className="field-label">Megjegyzés</label>
              <textarea name="notes" className="input-ds" rows={2} style={{ resize: "vertical" }} />
            </div>
          </div>

          {error && <div style={{ fontSize: 12, color: "var(--coral)", padding: "6px 10px", background: "var(--coral-soft)", borderRadius: 5 }}>{error}</div>}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 4 }}>
            <button type="button" className="btn" onClick={onClose} disabled={pending}>Mégse</button>
            <button type="submit" className="btn primary" disabled={pending}>
              {pending ? "Mentés..." : "Személy létrehozása"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
