import { db } from "@/lib/db";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PipelineSetupClient } from "./PipelineSetupClient";
import { PageHeader } from "@/components/astryx/PageHeader";
import k from "@/components/astryx/page.module.css";
import { serializeDates } from "@/lib/serialize";

const TENANT_ID = 1;

export default async function PipelineSetupPage() {
  const pipelines = await db.pipeline.findMany({
    where: { tenantId: TENANT_ID },
    include: {
      stages: { orderBy: { position: "asc" } },
      customFields: { orderBy: { position: "asc" } },
    },
    orderBy: { position: "asc" },
  });

  return (
    <div className="mount" style={{ maxWidth: 720 }}>
      <Link href="/deals" className={k.back}>
        <ArrowLeft style={{ width: 14, height: 14 }} />
        Vissza a pipeline-hoz
      </Link>

      <PageHeader title="Pipeline beállítás" help="Pipelines, fázisok, valószínűség konfigurálása." />

      <PipelineSetupClient pipelines={serializeDates(pipelines)} />
    </div>
  );
}
