import { db } from "@/lib/db";
import Link from "next/link";
import { serializeDates } from "@/lib/serialize";
import { DealsKanban } from "./DealsKanban";
import { Settings } from "lucide-react";

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
      <div className="flex flex-col items-center justify-center" style={{ height: "60vh", gap: 16 }}>
        <div className="font-mono-ndt text-xs px-2 py-0.5 rounded" style={{ background: "var(--indigo-soft)", color: "var(--indigo)", border: "1px solid var(--indigo-line)" }}>
          NINCS PIPELINE
        </div>
        <p style={{ fontSize: 14, color: "var(--fg-soft)", textAlign: "center", maxWidth: 360 }}>
          Hozz létre egy pipeline-t a deals kezeléséhez.
        </p>
        <Link href="/deals/setup" className="btn primary">
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
      {/* Header */}
      <div className="page-head">
        <div>
          <h1 className="page-title" style={{ gap: 12 }}>
            Pipeline
            <span className="font-mono-ndt" style={{ fontSize: 14, color: "var(--fg-mute)", fontWeight: 400 }}>
              · {openDeals} aktív
            </span>
            {staleDeals > 0 && (
              <span className="font-mono-ndt" style={{ fontSize: 14, color: "var(--coral)", fontWeight: 500 }}>
                · {staleDeals} lejárt ⚠
              </span>
            )}
          </h1>
          <p className="page-sub">
            Várható forgalom:{" "}
            <span className="font-mono-ndt" style={{ color: "var(--mint)" }}>
              {Math.round(forecast).toLocaleString("hu-HU")} HUF
            </span>
          </p>
        </div>
        <div className="page-actions">
          {/* Pipeline selector */}
          {pipelines.length > 1 && (
            <div className="flex items-center gap-1" style={{ background: "var(--bg-panel)", border: "1px solid var(--line-soft)", borderRadius: 6, padding: 2 }}>
              {pipelines.map((p) => (
                <Link
                  key={p.id}
                  href={`/deals?pipeline=${p.id}`}
                  className="font-mono-ndt rounded"
                  style={{
                    fontSize: 14, padding: "3px 10px",
                    background: p.id === activePipeline.id ? "var(--bg-hover)" : "transparent",
                    color: p.id === activePipeline.id ? "var(--fg)" : "var(--fg-mute)",
                  }}
                >
                  {p.name}
                </Link>
              ))}
            </div>
          )}
          <Link href="/deals/setup" className="btn" style={{ gap: 6 }}>
            <Settings style={{ width: 13, height: 13 }} />
            Beállítás
          </Link>
        </div>
      </div>

      <DealsKanban
        pipeline={serializeDates(activePipeline)}
        deals={serializeDates(dealsWithCF) as Parameters<typeof DealsKanban>[0]["deals"]}
      />
    </div>
  );
}
