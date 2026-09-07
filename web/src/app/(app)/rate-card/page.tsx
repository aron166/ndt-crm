import { getCostRates } from "@/app/actions/cost-rates";
import { RateCardClient } from "./RateCardClient";

export const metadata = { title: "Díjszabás — Helm CRM" };

export default async function RateCardPage() {
  const rates = await getCostRates();
  return (
    <div className="max-w-2xl">
      <div className="mb-5">
        <h1 style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em", margin: 0, color: "var(--fg)" }}>
          Díjszabás
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Alapértelmezett egység és egységár költségkódonként. Új feladat
          költségsoránál ezek töltődnek ki automatikusan — feladatonként
          felülírhatók.
        </p>
      </div>
      <RateCardClient initialRates={rates} />
    </div>
  );
}
