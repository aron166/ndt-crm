import { db } from "@/lib/db";
import Link from "next/link";
import { formatRelativeTime, contactFreshness } from "@/lib/utils";
import { PipelineStatusBadge } from "@/components/PipelineStatusBadge";

const TENANT_ID = 1;
const FRESHNESS_COLOR: Record<string, string> = {
  mint: "var(--mint)", mute: "var(--fg-mute)", amber: "var(--amber)", coral: "var(--coral)",
};

export default async function DashboardPage() {
  const now = new Date();
  const todayStart = new Date(now.toDateString());
  const weekEnd = new Date(todayStart.getTime() + 7 * 86400000);

  const [
    overdueTasks,
    todayTasks,
    weekTasks,
    recentInteractions,
    coldCompanies,
    pipelineStats,
  ] = await Promise.all([
    db.task.findMany({
      where: {
        tenantId: TENANT_ID,
        status: { in: ["created", "in_progress"] },
        dueDate: { lt: todayStart },
        parentTaskId: null,
      },
      include: { company: { select: { id: true, name: true } } },
      orderBy: { dueDate: "asc" },
      take: 8,
    }),
    db.task.findMany({
      where: {
        tenantId: TENANT_ID,
        status: { in: ["created", "in_progress"] },
        dueDate: { gte: todayStart, lt: new Date(todayStart.getTime() + 86400000) },
        parentTaskId: null,
      },
      include: { company: { select: { id: true, name: true } } },
      orderBy: { dueDate: "asc" },
      take: 10,
    }),
    db.task.count({
      where: {
        tenantId: TENANT_ID,
        status: { in: ["created", "in_progress"] },
        dueDate: { gte: todayStart, lt: weekEnd },
        parentTaskId: null,
      },
    }),
    db.interaction.findMany({
      where: { tenantId: TENANT_ID },
      include: {
        company: { select: { id: true, name: true } },
        person:  { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { occurredAt: "desc" },
      take: 8,
    }),
    db.company.findMany({
      where: {
        tenantId: TENANT_ID,
        OR: [
          { lastInteractionDate: null },
          { lastInteractionDate: { lt: new Date(now.getTime() - 90 * 86400000) } },
        ],
        pipelineStatus: { in: ["1", "2", "3", "5"] },
        NOT: { name: { contains: "F.A." } },
      },
      select: { id: true, name: true, city: true, pipelineStatus: true, lastInteractionDate: true },
      orderBy: { lastInteractionDate: "asc" },
      take: 8,
    }),
    db.$queryRaw<{ stage_name: string; color: string; cnt: bigint; total_value: number }[]>`
      SELECT ps.name as stage_name, ps.color, COUNT(d.id) as cnt,
             COALESCE(SUM(d.value::numeric), 0)::float as total_value
      FROM deals d
      JOIN pipeline_stages ps ON ps.id = d.stage_id
      WHERE d.tenant_id = ${TENANT_ID}
        AND ps.is_terminal_won = false AND ps.is_terminal_lost = false
      GROUP BY ps.id, ps.name, ps.color, ps.position
      ORDER BY ps.position
    `,
  ]);

  const weekday = now.toLocaleDateString("hu-HU", { weekday: "long" });
  const dateStr = now.toLocaleDateString("hu-HU", { year: "numeric", month: "long", day: "numeric" });

  const INTERACTION_LABEL: Record<string, string> = {
    call: "Hívás", email: "Email", meeting: "Találkozó", site_visit: "Helyszíni", note: "Megjegyzés",
  };
  const INTERACTION_COLOR: Record<string, string> = {
    call: "var(--mint)", email: "var(--sky)", meeting: "var(--violet)",
    site_visit: "var(--amber)", note: "var(--fg-mute)",
  };

  return (
    <div className="mount space-y-6">
      {/* Header */}
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--fg)", margin: 0, textTransform: "capitalize" }}>
          {weekday}
        </h1>
        <p style={{ fontSize: 13, color: "var(--fg-faint)", marginTop: 2, fontFamily: "var(--font-mono)" }}>
          {dateStr}
          {overdueTasks.length > 0 && (
            <span style={{ marginLeft: 12, color: "var(--coral)" }}>
              · {overdueTasks.length} lejárt feladat
            </span>
          )}
          {weekTasks > 0 && (
            <span style={{ marginLeft: 8, color: "var(--amber)" }}>
              · {weekTasks} a héten esedékes
            </span>
          )}
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>

        {/* Today's tasks */}
        <div className="panel mount mount-1">
          <div className="panel-head">
            <div className="panel-title">
              Feladatok
              {todayTasks.length > 0 && (
                <span style={{ marginLeft: 6, fontSize: 11, color: "var(--amber)", fontFamily: "var(--font-mono)" }}>
                  {todayTasks.length} ma
                </span>
              )}
            </div>
            <Link href="/tasks" style={{ fontSize: 11, color: "var(--indigo)" }}>Összes →</Link>
          </div>
          <div style={{ padding: "0 0 8px" }}>
            {overdueTasks.length === 0 && todayTasks.length === 0 ? (
              <div style={{ padding: "24px 20px", textAlign: "center", fontSize: 12, color: "var(--fg-faint)" }}>
                Nincs esedékes feladat
              </div>
            ) : (
              <>
                {overdueTasks.map((t) => (
                  <Link
                    key={t.id}
                    href={`/tasks/${t.id}`}
                    style={{ display: "block", padding: "7px 20px", borderBottom: "1px solid var(--line-soft)", textDecoration: "none" }}
                    className="tbl-row"
                  >
                    <div style={{ fontSize: 12, color: "var(--fg)", fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--coral)", boxShadow: "0 0 6px var(--coral)", flexShrink: 0 }} />
                      {t.title}
                    </div>
                    {t.company && <div style={{ fontSize: 11, color: "var(--fg-faint)", marginTop: 2, paddingLeft: 12 }}>{t.company.name}</div>}
                  </Link>
                ))}
                {todayTasks.map((t) => (
                  <Link
                    key={t.id}
                    href={`/tasks/${t.id}`}
                    style={{ display: "block", padding: "7px 20px", borderBottom: "1px solid var(--line-soft)", textDecoration: "none" }}
                    className="tbl-row"
                  >
                    <div style={{ fontSize: 12, color: "var(--fg)", fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--indigo)", flexShrink: 0 }} />
                      {t.title}
                    </div>
                    {t.company && <div style={{ fontSize: 11, color: "var(--fg-faint)", marginTop: 2, paddingLeft: 12 }}>{t.company.name}</div>}
                  </Link>
                ))}
              </>
            )}
          </div>
        </div>

        {/* Cold companies */}
        <div className="panel mount mount-2">
          <div className="panel-head">
            <div className="panel-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--amber)", boxShadow: "0 0 6px var(--amber)" }} />
              Hívandók
            </div>
            <Link href="/companies?never_contacted=1" style={{ fontSize: 11, color: "var(--indigo)" }}>Összes →</Link>
          </div>
          <div style={{ padding: "0 0 8px" }}>
            {coldCompanies.length === 0 ? (
              <div style={{ padding: "24px 20px", textAlign: "center", fontSize: 12, color: "var(--fg-faint)" }}>
                Nincs hívandó cég
              </div>
            ) : coldCompanies.map((c) => {
              const fresh = contactFreshness(c.lastInteractionDate);
              return (
                <Link
                  key={c.id}
                  href={`/companies/${c.id}`}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 20px", borderBottom: "1px solid var(--line-soft)", textDecoration: "none" }}
                  className="tbl-row"
                >
                  <div>
                    <div style={{ fontSize: 12, color: "var(--fg)", fontWeight: 500 }}>{c.name}</div>
                    <div style={{ fontSize: 10, color: "var(--fg-faint)", marginTop: 1 }}>
                      <PipelineStatusBadge status={c.pipelineStatus} />
                    </div>
                  </div>
                  <span className="font-mono-ndt" style={{ fontSize: 10, color: FRESHNESS_COLOR[fresh], flexShrink: 0 }}>
                    {formatRelativeTime(c.lastInteractionDate)}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Recent interactions */}
        <div className="panel mount mount-3">
          <div className="panel-head">
            <div className="panel-title">Aktivitás</div>
          </div>
          <div style={{ padding: "0 0 8px" }}>
            {recentInteractions.length === 0 ? (
              <div style={{ padding: "24px 20px", textAlign: "center", fontSize: 12, color: "var(--fg-faint)" }}>
                Nincs aktivitás
              </div>
            ) : recentInteractions.map((r) => {
              const color = INTERACTION_COLOR[r.type ?? "note"] ?? "var(--fg-mute)";
              return (
                <div key={r.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "7px 20px", borderBottom: "1px solid var(--line-soft)" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, marginTop: 5, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: "var(--fg-soft)", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {INTERACTION_LABEL[r.type ?? "note"] ?? r.type}
                      {r.company && (
                        <Link href={`/companies/${r.company.id}`} style={{ marginLeft: 6, color: "var(--fg-mute)", textDecoration: "none", fontWeight: 400 }}>
                          {r.company.name}
                        </Link>
                      )}
                    </div>
                    <div className="font-mono-ndt" style={{ fontSize: 10, color: "var(--fg-faint)", marginTop: 1 }}>
                      {formatRelativeTime(r.occurredAt)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Pipeline snapshot */}
      {pipelineStats.length > 0 && (
        <div className="panel mount mount-4">
          <div className="panel-head">
            <div className="panel-title">Pipeline</div>
            <Link href="/deals" style={{ fontSize: 11, color: "var(--indigo)" }}>Részletek →</Link>
          </div>
          <div style={{ display: "flex", gap: 1, padding: "0 20px 16px" }}>
            {pipelineStats.map((s) => (
              <div
                key={s.stage_name}
                style={{ flex: Number(s.cnt), minWidth: 60, padding: "10px 12px", background: `${s.color}18`, borderRadius: 6, marginRight: 8 }}
              >
                <div style={{ fontSize: 10, color: "var(--fg-faint)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
                  {s.stage_name}
                </div>
                <div className="font-mono-ndt" style={{ fontSize: 18, fontWeight: 500, color: s.color }}>
                  {Number(s.cnt)}
                </div>
                <div className="font-mono-ndt" style={{ fontSize: 10, color: "var(--fg-faint)", marginTop: 2 }}>
                  {(s.total_value / 1_000_000).toFixed(1)}M HUF
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
