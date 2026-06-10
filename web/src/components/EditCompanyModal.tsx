"use client";

import { useState, useTransition } from "react";
import { updateCompany } from "@/app/actions/companies";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Company {
  id: number; name: string; vatNumber: string | null;
  status: string | null; accountType: string | null;
  city: string | null; county: string | null;
  address: string | null; zipCode: string | null; country: string | null;
  website: string | null; pipelineStatus: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  company: Company;
}

const PIPELINE_OPTIONS = [
  { value: "", label: "—" },
  { value: "0", label: "0 – KUKA" },
  { value: "1", label: "1 – Nem hívtuk" },
  { value: "2", label: "2 – Nem válasz" },
  { value: "3", label: "3 – Érdekli" },
  { value: "4", label: "4 – Nem kell" },
  { value: "5", label: "5 – Kéri" },
  { value: "6", label: "6 – Függőben" },
  { value: "7", label: "7 – Elveszett" },
  { value: "8", label: "8 – Nyert" },
];

export function EditCompanyModal({ open, onClose, company }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const res = await updateCompany(company.id, {
        name:           fd.get("name") as string,
        vatNumber:      fd.get("vatNumber") as string,
        status:         fd.get("status") as string,
        accountType:    fd.get("accountType") as string,
        city:           fd.get("city") as string,
        county:         fd.get("county") as string,
        address:        fd.get("address") as string,
        zipCode:        fd.get("zipCode") as string,
        country:        fd.get("country") as string,
        website:        fd.get("website") as string,
        pipelineStatus: fd.get("pipelineStatus") as string,
      });
      if (res.error) { setError(res.error); return; }
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cég szerkesztése</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="field-group" style={{ gridColumn: "1 / -1" }}>
              <label className="field-label">Cég neve *</label>
              <input name="name" className="input-ds" defaultValue={company.name} required />
            </div>
            <div className="field-group">
              <label className="field-label">Adószám</label>
              <input name="vatNumber" className="input-ds" defaultValue={company.vatNumber ?? ""} />
            </div>
            <div className="field-group">
              <label className="field-label">Website</label>
              <input name="website" className="input-ds" defaultValue={company.website ?? ""} />
            </div>
            <div className="field-group">
              <label className="field-label">Státusz</label>
              <select name="status" className="input-ds" defaultValue={company.status ?? "active"}>
                <option value="active">Aktív</option>
                <option value="inactive">Inaktív</option>
                <option value="fa">F.A.</option>
              </select>
            </div>
            <div className="field-group">
              <label className="field-label">Partner kategória</label>
              <select name="accountType" className="input-ds" defaultValue={company.accountType ?? ""}>
                <option value="">—</option>
                <option value="Prospect">Prospect</option>
                <option value="Customer">Ügyfél</option>
                <option value="Vendor">Szállító</option>
              </select>
            </div>
            <div className="field-group">
              <label className="field-label">Pipeline státusz</label>
              <select name="pipelineStatus" className="input-ds" defaultValue={company.pipelineStatus ?? ""}>
                {PIPELINE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="field-group">
              <label className="field-label">Ország</label>
              <input name="country" className="input-ds" defaultValue={company.country ?? "Magyarország"} />
            </div>
            <div className="field-group">
              <label className="field-label">Megye</label>
              <input name="county" className="input-ds" defaultValue={company.county ?? ""} />
            </div>
            <div className="field-group">
              <label className="field-label">Város</label>
              <input name="city" className="input-ds" defaultValue={company.city ?? ""} />
            </div>
            <div className="field-group">
              <label className="field-label">Irányítószám</label>
              <input name="zipCode" className="input-ds" defaultValue={company.zipCode ?? ""} />
            </div>
            <div className="field-group" style={{ gridColumn: "1 / -1" }}>
              <label className="field-label">Utca, házszám</label>
              <input name="address" className="input-ds" defaultValue={company.address ?? ""} />
            </div>
          </div>

          {error && <div style={{ fontSize: 12, color: "var(--coral)", padding: "6px 10px", background: "var(--coral-soft)", borderRadius: 5 }}>{error}</div>}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 4 }}>
            <button type="button" className="btn" onClick={onClose} disabled={pending}>Mégse</button>
            <button type="submit" className="btn primary" disabled={pending}>
              {pending ? "Mentés..." : "Mentés"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
