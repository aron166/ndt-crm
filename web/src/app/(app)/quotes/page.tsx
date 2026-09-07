import { getQuotes } from "@/app/actions/quotes";
import { QuotesClient } from "./QuotesClient";

export const metadata = { title: "Árajánlatok — Helm CRM" };
export const dynamic = "force-dynamic";

export default async function QuotesPage() {
  const quotes = await getQuotes();
  return <QuotesClient quotes={quotes} />;
}
