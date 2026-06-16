import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getQuote } from "@/app/actions/quotes";
import { getCostRates } from "@/app/actions/cost-rates";
import { QuoteBuilderClient } from "./QuoteBuilderClient";

const TENANT_ID = 1;
export const dynamic = "force-dynamic";

export default async function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();

  const quote = await getQuote(parseInt(id, 10));
  if (!quote) notFound();

  // Active contacts at the quote's company → recipient dropdown.
  const contacts = await db.contact.findMany({
    where: { companyId: quote.companyId, endedAt: null, tenantId: TENANT_ID, person: { deletedAt: null } },
    select: { person: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: { person: { lastName: "asc" } },
  });
  const rates = await getCostRates();

  return (
    <QuoteBuilderClient
      quote={quote}
      contacts={contacts.map((c) => ({ id: c.person.id, name: `${c.person.lastName} ${c.person.firstName}`.trim() }))}
      rates={rates}
    />
  );
}
