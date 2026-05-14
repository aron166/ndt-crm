"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCompany } from "@/app/actions/companies";
import { X } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CreateCompanyModal({ open, onClose }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data = {
      name:        fd.get("name") as string,
      vatNumber:   fd.get("vatNumber") as string,
      status:      fd.get("status") as string,
      accountType: fd.get("accountType") as string,
      city:        fd.get("city") as string,
      county:      fd.get("county") as string,
      address:     fd.get("address") as string,
      zipCode:     fd.get("zipCode") as string,
      website:     fd.get("website") as string,
    };
    setError(null);
    startTransition(async () => {
      const res = await createCompany(data);
      if (res.error) { setError(res.error); return; }
      onClose();
      if (res.id) router.push(`/companies/${res.id}`);
      else router.refresh();
    });
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 540 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">Új cég</span>
          <button className="modal-close" onClick={onClose}><X style={{ width: 16, height: 16 }} /></button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="field-group" style={{ gridColumn: "1 / -1" }}>
              <label className="field-label">Cég neve *</label>
              <input name="name" className="input-ds" placeholder="Pl. ACÉLHIDAK KFT." required autoFocus />
            </div>
            <div className="field-group">
              <label className="field-label">Adószám</label>
              <input name="vatNumber" className="input-ds" placeholder="12345678-2-01" />
            </div>
            <div className="field-group">
              <label className="field-label">Website</label>
              <input name="website" className="input-ds" placeholder="https://..." type="url" />
            </div>
            <div className="field-group">
              <label className="field-label">Státusz</label>
              <select name="status" className="input-ds">
                <option value="active">Aktív</option>
                <option value="inactive">Inaktív</option>
                <option value="fa">F.A.</option>
              </select>
            </div>
            <div className="field-group">
              <label className="field-label">Partner kategória</label>
              <select name="accountType" className="input-ds">
                <option value="">—</option>
                <option value="Prospect">Prospect</option>
                <option value="Customer">Ügyfél</option>
                <option value="Vendor">Szállító</option>
              </select>
            </div>
            <div className="field-group">
              <label className="field-label">Város</label>
              <input name="city" className="input-ds" placeholder="Budapest" />
            </div>
            <div className="field-group">
              <label className="field-label">Megye</label>
              <input name="county" className="input-ds" placeholder="Pest vármegye" />
            </div>
            <div className="field-group" style={{ gridColumn: "1 / -1" }}>
              <label className="field-label">Cím</label>
              <input name="address" className="input-ds" placeholder="Fő utca 1." />
            </div>
          </div>

          {error && <div style={{ fontSize: 12, color: "var(--coral)", padding: "6px 10px", background: "var(--coral-soft)", borderRadius: 5 }}>{error}</div>}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 4 }}>
            <button type="button" className="btn" onClick={onClose} disabled={pending}>Mégse</button>
            <button type="submit" className="btn primary" disabled={pending}>
              {pending ? "Mentés..." : "Cég létrehozása"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
