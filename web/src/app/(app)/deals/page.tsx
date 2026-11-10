import { db } from "@/lib/db";
import Link from "next/link";
import { serializeDates } from "@/lib/serialize";
import { DealsKanban } from "./DealsKanban";
import { Settings } from "lucide-react";
import { PageHeader, Seg } from "@/components/astryx/PageHeader";
import k from "@/components/astryx/page.module.css";

const TENANT_ID = 1;

interface SearchParams { pipeline?: string; }

export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  const pipelines = await db.pipeline.findMany({
    where: { tenantId: TENANT_ID, isArchived: false },
    include: {
      stages: { orderBy: { position: "asc" } },
      customFields: { orderBy: { position: "asc" } },
    },
    orderBy: { position: "asc" },
  });

  if (pipelines.length === 0) {
    return (
      <div className={k.empty} style={{ alignItems: "center", textAlign: "center", minHeight: "60vh", justifyContent: "center" }}>
        <span className={k.strong}>NINCS PIPELINE</span>
        <p className={k.muted} style={{ maxWidth: 360, margin: 0 }}>
          Hozz létre egy pipeline-t a deals kezeléséhez.
        </p>
        <Link href="/deals/setup" className={`${k.btn} ${k.btnPrimary}`}>
          Pipeline létrehozása
        </Link>
      </div>
    );
  }

  // Select active pipeline
  const activePipeline = params.pipeline
    ? pipelines.find((p) => p.id === parseInt(params.pipeline!))
    : pipelines[0];

  if (!activePipeline) return null;

  // Fetch deals for this pipeline, including open-task check for stale warning
  const deals = await db.deal.findMany({
    where: { tenantId: TENANT_ID, pipelineId: activePipeline.id },
    include: {
      company: { select: { id: true, name: true } },
      person:  { select: { id: true, firstName: true, lastName: true } },
      stage:   { select: { id: true, name: true, color: true, isTerminalWon: true, isTerminalLost: true } },
      tasks:   {
        where: { status: { in: ["created", "not_started", "in_progress"] } },
        select: { id: true },
        take: 1,
      },
    },
    orderBy: { position: "asc" },
  });

  // cast JSONB custom field values for the client
  const dealsWithCF = deals.map((d) => ({
    ...d,
    customFields: (d.customFields ?? null) as Record<string, string> | null,
  }));

  // Weighted forecast = Σ (deal.value × stage.probability / 100) for non-terminal stages
  const forecast = deals.reduce((sum, d) => {
    if (!d.value || !d.stage || d.stage.isTerminalWon || d.stage.isTerminalLost) return sum;
    const stageData = activePipeline.stages.find((s) => s.id === d.stageId);
    return sum + (Number(d.value) * (stageData?.probability ?? 50)) / 100;
  }, 0);

  const openDeals = deals.filter(
    (d) => !d.stage?.isTerminalWon && !d.stage?.isTerminalLost
  ).length;

  const staleDeals = deals.filter(
    (d) => !d.stage?.isTerminalWon && !d.stage?.isTerminalLost && d.tasks.length === 0
  ).length;

  return (
    <div className="mount">
      <PageHeader
        title="Pipeline"
        eyebrow={
          <>
            {openDeals} aktív
            {staleDeals > 0 && <span style={{ color: "var(--color-text-error)" }}> · {staleDeals} lejárt</span>}
            {" · "}Várható forgalom:{" "}
            <span className={k.num} style={{ color: "var(--color-text-primary)", fontWeight: 600 }}>
              {Math.round(forecast).toLocaleString("hu-HU")} HUF
            </span>
          </>
        }
        views={
          pipelines.length > 1 ? (
            <Seg
              label="Pipeline"
              current={String(activePipeline.id)}
              items={pipelines.map((p) => ({ key: String(p.id), label: p.name, href: `/deals?pipeline=${p.id}` }))}
            />
          ) : undefined
        }
        actions={
          <Link href="/deals/setup" className={k.btn}>
            <Settings style={{ width: 14, height: 14 }} />
            Beállítás
          </Link>
        }
      />

      <DealsKanban
        pipeline={serializeDates(activePipeline)}
        deals={serializeDates(dealsWithCF) as Parameters<typeof DealsKanban>[0]["deals"]}
      />
    </div>
  );
}
