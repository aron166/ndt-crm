"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { triggerBulkEnrichment } from "@/app/actions/enrichment";
import k from "@/components/astryx/page.module.css";

interface Props {
  companyIds: number[];
}

export function RunEnrichmentButton({ companyIds }: Props) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick() {
    startTransition(async () => {
      const runId = await triggerBulkEnrichment("company", companyIds);
      router.push(`/enrichment?run=${runId}`);
    });
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending || companyIds.length === 0}
      title={`Enrichment futtatása ${Math.min(companyIds.length, 20)} cégre`}
      className={k.btn}
      style={{ whiteSpace: "nowrap" }}
    >
      <SparkleIcon />
      {isPending ? "Enrichment fut..." : "Enrichment futtatása"}
    </button>
  );
}

function SparkleIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z"/>
      <path d="M19 15l.75 2.25L22 18l-2.25.75L19 21l-.75-2.25L16 18l2.25-.75z"/>
    </svg>
  );
}
