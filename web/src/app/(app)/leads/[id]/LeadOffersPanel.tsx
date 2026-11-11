"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/FormField";
import { createLeadOfferAction, sendLeadOfferAction, acceptLeadOfferAction } from "@/app/actions/offers";
import { OFFER_TEMPLATES, OFFER_TEMPLATE_LABEL, type OfferTemplate } from "@/lib/offers/offer";
import { DOCUMENT_TITLE, type DocumentKind } from "@/lib/documents/document";
import { formatDateTime } from "@/lib/utils";

export interface LeadOffer {
  id: number;
  quoteNumber: string;
  template: string | null;
  status: string;
  createdAt: string | Date;
  sentAt: string | Date | null;
  acceptedAt: string | Date | null;
}

export interface LeadDocumentRow {
  id: number;
  kind: string;
  number: string;
  createdAt: string | Date;
}


export function LeadOffersPanel({ leadId, offers, documents, status }: { leadId: number; offers: LeadOffer[]; documents: LeadDocumentRow[]; status: string | null }) {
  const router = useRouter();
  const [template, setTemplate] = useState<OfferTemplate>("demo");
  const [areaM2, setAreaM2] = useState("");
  const [bigPackage, setBigPackage] = useState<"standard" | "unlimited">("standard");
  const [months, setMonths] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setNote(null);
    startTransition(async () => {
      const res = await createLeadOfferAction(leadId, {
        template,
        areaM2: template === "big_service" && areaM2 ? Number(areaM2) : undefined,
        bigPackage: template === "big_service" ? bigPackage : undefined,
        months: template === "rental" && months ? Number(months) : undefined,
      });
      if ("error" in res) { setError(res.error); return; }
      // PROPOSAL copy
      if (res.hasPlaceholders) setNote("Az ajánlatban egyeztetés alatti adat van (ár vagy cégadat): így nem küldhető ki. Az adatokat Nate tölti fel a konfigurációba.");
      router.refresh();
    });
  }

  function send(quoteId: number) {
    // PROPOSAL copy
    if (!confirm("Elküldöd az ajánlatot a leadnek e-mailben?")) return;
    setError(null); setNote(null);
    startTransition(async () => {
      const res = await sendLeadOfferAction(quoteId);
      if ("error" in res) { setError(res.error); return; }
      setNote(`Elküldve: ${res.to}`); // PROPOSAL copy
      router.refresh();
    });
  }

  function accept(quoteId: number) {
    // PROPOSAL copy
    if (!confirm("A lead elfogadta az ajánlatot (Elfogadom)? A lead a Megrendelve fázisba kerül.")) return;
    setError(null); setNote(null);
    startTransition(async () => {
      const res = await acceptLeadOfferAction(quoteId);
      if ("error" in res) { setError(res.error); return; }
      if ("warning" in res && res.warning) setNote(res.warning);
      router.refresh();
    });
  }

  return (
    <div className="card" style={{ padding: 16, marginTop: 16 }}>
      {/* PROPOSAL copy */}
      <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 12px" }}>Ajánlatok és dokumentumok</h2>

      <form onSubmit={create} style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end", marginBottom: 12 }}>
        {/* PROPOSAL copy */}
        <FormField label="Sablon">
          <select className="input-ds" value={template} onChange={(e) => setTemplate(e.target.value as OfferTemplate)}>
            {OFFER_TEMPLATES.map((t) => <option key={t} value={t}>{OFFER_TEMPLATE_LABEL[t]}</option>)}
          </select>
        </FormField>
        {template === "big_service" && (
          <>
            {/* PROPOSAL copy */}
            <FormField label="Terület (m2)">
              <Input type="number" min={0} step="any" value={areaM2} onChange={(e) => setAreaM2(e.target.value)} />
            </FormField>
            {/* PROPOSAL copy */}
            <FormField label="Csomag">
              <select className="input-ds" value={bigPackage} onChange={(e) => setBigPackage(e.target.value as "standard" | "unlimited")}>
                <option value="standard">Standard</option>
                <option value="unlimited">Unlimited</option>
              </select>
            </FormField>
          </>
        )}
        {template === "rental" && (
          // PROPOSAL copy
          <FormField label="Hónapok">
            <Input type="number" min={1} step={1} value={months} onChange={(e) => setMonths(e.target.value)} />
          </FormField>
        )}
        {/* PROPOSAL copy */}
        <Button type="submit" disabled={pending}>
          Ajánlat készítése
        </Button>
      </form>

      {note && <p className="text-sm" style={{ color: "var(--ui-warning-text)", marginBottom: 8 }}>{note}</p>}
      {error && <p className="text-sm" style={{ color: "var(--ui-danger-text)", marginBottom: 8 }}>{error}</p>}

      {offers.length === 0 ? (
        // PROPOSAL copy
        <p className="text-sm" style={{ color: "var(--ui-text-muted)" }}>Még nincs ajánlat.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {offers.map((o) => {
            const open = o.status === "draft" || o.status === "sent";
            return (
              <div key={o.id} style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", fontSize: 13 }}>
                <strong>{o.quoteNumber}</strong>
                <span>{OFFER_TEMPLATE_LABEL[o.template as OfferTemplate] ?? o.template}</span>
                <span style={{ color: "var(--ui-text-muted)" }}>{o.status}</span>
                <span style={{ color: "var(--ui-text-muted)" }}>{formatDateTime(o.createdAt)}</span>
                <a href={`/leads/${leadId}/offers/${o.id}/pdf`} target="_blank" rel="noreferrer" className="row-link">PDF</a>
                {open && (
                  <>
                    {/* PROPOSAL copy */}
                    <Button type="button" variant="outline" disabled={pending} onClick={() => send(o.id)}>Küldés e-mailben</Button>
                    <Button type="button" variant="outline" disabled={pending} onClick={() => accept(o.id)}>Ajánlat elfogadva</Button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {documents.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
          {documents.map((d) => (
            <div key={d.id} style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", fontSize: 13 }}>
              <span>{DOCUMENT_TITLE[d.kind as DocumentKind] ?? d.kind}</span>
              <strong>{d.number}</strong>
              <span style={{ color: "var(--ui-text-muted)" }}>{formatDateTime(d.createdAt)}</span>
              <a href={`/leads/${leadId}/documents/${d.id}/pdf`} target="_blank" rel="noreferrer" className="row-link">PDF</a>
            </div>
          ))}
        </div>
      )}

      {status === "ordered" && (
        // PROPOSAL copy
        <Link href={`/leads/${leadId}/signoff`} className={buttonVariants({ className: "mt-3" })}>
          Helyszíni átvétel (aláírás)
        </Link>
      )}
    </div>
  );
}
