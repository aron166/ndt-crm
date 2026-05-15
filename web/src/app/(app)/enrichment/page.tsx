import { getEnrichmentRuns, getPendingProposals } from "@/app/actions/enrichment";
import { serializeDates } from "@/lib/serialize";
import { EnrichmentClient } from "./EnrichmentClient";
import type { ComponentProps } from "react";

type ClientProps = ComponentProps<typeof EnrichmentClient>;

export default async function EnrichmentPage() {
  const [runs, proposals] = await Promise.all([
    getEnrichmentRuns(),
    getPendingProposals(),
  ]);

  return (
    <EnrichmentClient
      runs={serializeDates(runs) as unknown as ClientProps["runs"]}
      proposals={serializeDates(proposals) as unknown as ClientProps["proposals"]}
    />
  );
}
