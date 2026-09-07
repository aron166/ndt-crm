"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCompany } from "@/app/actions/companies";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/FormField";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CreateCompanyModal({ open, onClose }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

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
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Új cég</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <FormField label="Cég neve" required full>
              <input name="name" className="input-ds" placeholder="Pl. ACÉLHIDAK KFT." required autoFocus />
            </FormField>
            <FormField label="Adószám">
              <input name="vatNumber" className="input-ds" placeholder="12345678-2-01" />
            </FormField>
            <FormField label="Website">
              <input name="website" className="input-ds" placeholder="https://..." type="url" />
            </FormField>
            <FormField label="Státusz">
              <select name="status" className="input-ds">
                <option value="active">Aktív</option>
                <option value="inactive">Inaktív</option>
                <option value="fa">F.A.</option>
              </select>
            </FormField>
            <FormField label="Partner kategória">
              <select name="accountType" className="input-ds">
                <option value="">—</option>
                <option value="Prospect">Prospect</option>
                <option value="Customer">Ügyfél</option>
                <option value="Vendor">Szállító</option>
              </select>
            </FormField>
            <FormField label="Város">
              <input name="city" className="input-ds" placeholder="Budapest" />
            </FormField>
            <FormField label="Megye">
              <input name="county" className="input-ds" placeholder="Pest vármegye" />
            </FormField>
            <FormField label="Cím" full>
              <input name="address" className="input-ds" placeholder="Fő utca 1." />
            </FormField>
          </div>

          {error && <div style={{ fontSize: 14, color: "var(--coral)", padding: "6px 10px", background: "var(--coral-soft)", borderRadius: 5 }}>{error}</div>}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 4 }}>
            <button type="button" className="btn" onClick={onClose} disabled={pending}>Mégse</button>
            <button type="submit" className="btn primary" disabled={pending}>
              {pending ? "Mentés..." : "Cég létrehozása"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
