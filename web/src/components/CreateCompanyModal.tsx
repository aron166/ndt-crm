"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCompany } from "@/app/actions/companies";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { COMPANY_ATTR_DEFS } from "@/lib/companies/attributes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
              <Input name="name" placeholder="Pl. ACÉLHIDAK KFT." required autoFocus />
            </FormField>
            <FormField label="Adószám">
              <Input name="vatNumber" placeholder="12345678-2-01" />
            </FormField>
            <FormField label="Website">
              <Input name="website" placeholder="https://..." type="url" />
            </FormField>
            <FormField label="Státusz">
              <select name="status" className="input-ds">
                {COMPANY_ATTR_DEFS.status.options!.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
              </select>
            </FormField>
            <FormField label="Partner kategória">
              <select name="accountType" className="input-ds">
                <option value="">-</option>
                {COMPANY_ATTR_DEFS.account_type.options!.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
              </select>
            </FormField>
            <FormField label="Város">
              <Input name="city" placeholder="Budapest" />
            </FormField>
            <FormField label="Megye">
              <Input name="county" placeholder="Pest vármegye" />
            </FormField>
            <FormField label="Cím" full>
              <Input name="address" placeholder="Fő utca 1." />
            </FormField>
          </div>

          {error && <div style={{ fontSize: 14, color: "var(--ui-danger-text)", padding: "6px 10px", background: "var(--ui-danger-surface)", borderRadius: "var(--ui-radius-control)" }}>{error}</div>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>Mégse</Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Mentés..." : "Cég létrehozása"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
