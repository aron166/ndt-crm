import { getCostRates } from "@/app/actions/cost-rates";
import { PageHeader } from "@/components/astryx/PageHeader";
import { RateCardClient } from "./RateCardClient";

export const metadata = { title: "Díjszabás: Helm CRM" };

export default async function RateCardPage() {
  const rates = await getCostRates();
  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Díjszabás"
        help="Alapértelmezett egység és egységár költségkódonként. Új feladat költségsoránál ezek töltődnek ki automatikusan: feladatonként felülírhatók."
      />
      <RateCardClient initialRates={rates} />
    </div>
  );
}
