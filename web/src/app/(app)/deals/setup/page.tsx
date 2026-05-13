import { db } from "@/lib/db";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PipelineSetupClient } from "./PipelineSetupClient";
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
      <Link href="/deals" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--fg-mute)", marginBottom: 16 }} className="row-link">
        <ArrowLeft style={{ width: 14, height: 14 }} />
        Vissza a pipeline-hoz
      </Link>

      <div className="page-head">
        <div>
          <h1 className="page-title">Pipeline beállítás</h1>
          <p className="page-sub">Pipelines, fázisok, valószínűség konfigurálása.</p>
        </div>
      </div>

      <PipelineSetupClient pipelines={serializeDates(pipelines)} />
    </div>
  );
}
