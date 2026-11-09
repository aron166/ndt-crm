import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { SignOffForm } from "./SignOffForm";

const TENANT_ID = 1;

export default async function SignOffPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const leadId = parseInt(id, 10);
  const lead = await db.lead.findFirst({
    where: { id: leadId, tenantId: TENANT_ID },
    include: {
      company: { select: { name: true } },
      contact: { select: { person: { select: { firstName: true, lastName: true } } } },
    },
  });
  if (!lead) notFound();
  const order = await db.leadDocument.findFirst({
    where: { tenantId: TENANT_ID, leadId, kind: "order" },
    orderBy: { createdAt: "desc" },
    select: { number: true },
  });
  const p = lead.contact?.person;
  const contactName = p ? `${p.lastName ?? ""} ${p.firstName ?? ""}`.trim() : "";

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 16 }}>
      {/* PROPOSAL copy */}
      <h1 style={{ fontSize: 24, fontWeight: 600, margin: "0 0 8px" }}>Helyszíni átvétel</h1>
      <p style={{ fontSize: 18, margin: "0 0 4px" }}>
        {lead.company?.name ?? "-"}{contactName ? `, ${contactName}` : ""}
      </p>
      {/* PROPOSAL copy */}
      <p style={{ fontSize: 16, color: "var(--fg-mute)", margin: "0 0 16px" }}>
        Megrendelő: {order?.number ?? "nincs"}
      </p>
      <SignOffForm leadId={leadId} />
    </div>
  );
}
