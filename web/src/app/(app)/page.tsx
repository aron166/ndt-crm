import { db } from "@/lib/db";
import Link from "next/link";
import { formatRelativeTime, contactFreshness } from "@/lib/utils";
import { PipelineStatusBadge } from "@/components/PipelineStatusBadge";

const TENANT_ID = 1;

const FRESHNESS_COLOR: Record<string, string> = {
  mint: "var(--mint)", mute: "var(--fg-mute)", amber: "var(--amber)", coral: "var(--coral)",
};
const INTERACTION_LABEL: Record<string, string> = {
  call: "Hívás", email: "Email", meeting: "Találkozó", site_visit: "Helyszíni", note: "Megjegyzés",
};
const INTERACTION_COLOR: Record<string, string> = {
  call: "var(--mint)", email: "var(--sky)", meeting: "var(--violet)",
  site_visit: "var(--amber)", note: "var(--fg-mute)",
};

export default async function DashboardPage() {
  const now = new Date();
  const todayStart = new Date(now.toDateString());
  const weekStart = new Date(todayStart.getTime() - now.getDay() * 86400000);
  const weekEnd = new Date(todayStart.getTime() + 7 * 86400000);

  const [
    overdueTasks,
    todayTasks,
    weekTasks,
    recentInteractions,
    coldCompanies,
    pipelineStats,
    statCompanies,
    statOpenDeals,
    statOpenTasks,
    statInteractionsWeek,
  ] = await Promise.all([
    db.task.findMany({
      where: { tenantId: TENANT_ID, status: { in: ["created", "in_progress"] }, dueDate: { lt: todayStart }, parentTaskId: null },
      include: { company: { select: { id: true, name: true } } },
      orderBy: { dueDate: "asc" },
      take: 8,
    }),
    db.task.findMany({
      where: { tenantId: TENANT_ID, status: { in: ["created", "in_progress"] }, dueDate: { gte: todayStart, lt: new Date(todayStart.getTime() + 86400000) }, parentTaskId: null },
      include: { company: { select: { id: true, name: true } } },
      orderBy: { dueDate: "asc" },
      take: 10,
    }),
    db.task.count({
      where: { tenantId: TENANT_ID, status: { in: ["created", "in_progress"] }, dueDate: { gte: todayStart, lt: weekEnd }, parentTaskId: null },
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
        OR: [{ lastInteractionDate: null }, { lastInteractionDate: { lt: new Date(now.getTime() - 90 * 86400000) } }],
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
    db.company.count({ where: { tenantId: TENANT_ID, NOT: { name: { contains: "F.A." } } } }),
    db.deal.count({ where: { tenantId: TENANT_ID, stage: { isTerminalWon: false, isTerminalLost: false } } }),
    db.task.count({ where: { tenantId: TENANT_ID, status: { in: ["created", "in_progress"] }, parentTaskId: null } }),
    db.interaction.count({ where: { tenantId: TENANT_ID, occurredAt: { gte: weekStart } } }),
  ]);

  const weekday = now.toLocaleDateString("hu-HU", { weekday: "long" });
  const dateStr = now.toLocaleDateString("hu-HU", { year: "numeric", month: "long", day: "numeric" });

  const stats = [
    { label: "Aktív cég",        value: statCompanies.toLocaleString("hu-HU"),    href: "/companies", color: "var(--sky)" },
    { label: "Nyitott deal",     value: statOpenDeals.toLocaleString("hu-HU"),     href: "/deals",     color: "var(--indigo)" },
    { label: "Nyitott feladat",  value: statOpenTasks.toLocaleString("hu-HU"),     href: "/tasks",     color: overdueTasks.length > 0 ? "var(--coral)" : "var(--mint)" },
    { label: "Interakció / hét", value: statInteractionsWeek.toLocaleString("hu-HU"), href: "/companies", color: "var(--amber)" },
  ];

  const pipeline = pipelineStats as { stage_name: string; color: string; cnt: bigint; total_value: number }[];
  const pipelineTotal = pipeline.reduce((s, r) => s + Number(r.cnt), 0);

  return (
    <div className="mount space-y-5">

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--fg)", margin: 0, textTransform: "capitalize" }}>
            {weekday}
          </h1>
          <p style={{ fontSize: 12, color: "var(--fg-faint)", marginTop: 3, fontFamily: "var(--font-mono-ndt)" }}>
            {dateStr}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {overdueTasks.length > 0 && (
            <Link href="/tasks" style={{ fontSize: 11, color: "var(--coral)", background: "var(--coral-soft)", padding: "3px 10px", borderRadius: 20, textDecoration: "none", fontWeight: 500 }}>
              {overdueTasks.length} lejárt feladat
            </Link>
          )}
          {weekTasks > 0 && (
            <Link href="/tasks" style={{ fontSize: 11, color: "var(--amber)", background: "var(--amber-soft)", padding: "3px 10px", borderRadius: 20, textDecoration: "none", fontWeight: 500 }}>
              {weekTasks} a héten esedékes
            </Link>
          )}
        </div>
      </div>

      {/* Stat strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            style={{ textDecoration: "none", display: "block", padding: "14px 18px", background: "var(--bg-panel)", border: "1px solid var(--line-soft)", borderRadius: 8, boxShadow: "var(--shadow-card)" }}
            className="tbl-row"
          >
            <div className="font-mono-ndt" style={{ fontSize: 24, fontWeight: 600, color: s.color, letterSpacing: "-0.02em", lineHeight: 1 }}>
              {s.value}
            </div>
            <div style={{ fontSize: 11, color: "var(--fg-faint)", marginTop: 5, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {s.label}
            </div>
          </Link>
        ))}
      </div>

      {/* 3-col grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>

        {/* Tasks */}
        <div className="panel mount mount-1">
          <div className="panel-head">
            <div className="panel-title">
              Feladatok
              {todayTasks.length > 0 && (
                <span className="font-mono-ndt" style={{ marginLeft: 6, fontSize: 10, color: "var(--amber)", background: "var(--amber-soft)", padding: "1px 6px", borderRadius: 10 }}>
                  {todayTasks.length} ma
                </span>
              )}
            </div>
            <Link href="/tasks" style={{ fontSize: 11, color: "var(--indigo)" }}>Összes →</Link>
          </div>
          <div>
            {overdueTasks.length === 0 && todayTasks.length === 0 ? (
              <div style={{ padding: "32px 20px", textAlign: "center", fontSize: 12, color: "var(--fg-faint)" }}>
                Nincs esedékes feladat
              </div>
            ) : (
              <>
                {overdueTasks.map((t) => (
                  <Link key={t.id} href={`/tasks/${t.id}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", borderBottom: "1px solid var(--line-soft)", textDecoration: "none" }} className="tbl-row">
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--coral)", boxShadow: "0 0 8px var(--coral)", flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: "var(--fg)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div>
                      {t.company && <div style={{ fontSize: 10, color: "var(--fg-faint)", marginTop: 1 }}>{t.company.name}</div>}
                    </div>
                  </Link>
                ))}
                {todayTasks.map((t) => (
                  <Link key={t.id} href={`/tasks/${t.id}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", borderBottom: "1px solid var(--line-soft)", textDecoration: "none" }} className="tbl-row">
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--indigo)", boxShadow: "0 0 6px oklch(0.66 0.19 278 / 0.6)", flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: "var(--fg)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div>
                      {t.company && <div style={{ fontSize: 10, color: "var(--fg-faint)", marginTop: 1 }}>{t.company.name}</div>}
                    </div>
                  </Link>
                ))}
              </>
            )}
          </div>
        </div>

        {/* Cold companies */}
        <div className="panel mount mount-2">
          <div className="panel-head">
            <div className="panel-title">Hívandók</div>
            <Link href="/calls" style={{ fontSize: 11, color: "var(--indigo)" }}>Hívás mód →</Link>
          </div>
          <div>
            {coldCompanies.length === 0 ? (
              <div style={{ padding: "32px 20px", textAlign: "center", fontSize: 12, color: "var(--fg-faint)" }}>
                Nincs hívandó cég
              </div>
            ) : coldCompanies.map((c) => {
              const fresh = contactFreshness(c.lastInteractionDate);
              return (
                <Link key={c.id} href={`/companies/${c.id}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "8px 16px", borderBottom: "1px solid var(--line-soft)", textDecoration: "none" }} className="tbl-row">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: "var(--fg)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                    <div style={{ fontSize: 10, marginTop: 1 }}><PipelineStatusBadge status={c.pipelineStatus} /></div>
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
          <div>
            {recentInteractions.length === 0 ? (
              <div style={{ padding: "32px 20px", textAlign: "center", fontSize: 12, color: "var(--fg-faint)" }}>
                Nincs aktivitás
              </div>
            ) : recentInteractions.map((r) => {
              const color = INTERACTION_COLOR[r.type ?? "note"] ?? "var(--fg-mute)";
              const label = INTERACTION_LABEL[r.type ?? "note"] ?? r.type;
              return (
                <div key={r.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 16px", borderBottom: "1px solid var(--line-soft)" }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, marginTop: 4, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: "var(--fg-soft)", fontWeight: 500 }}>
                      <span style={{ color }}>{label}</span>
                      {r.company && (
                        <Link href={`/companies/${r.company.id}`} style={{ marginLeft: 5, color: "var(--fg-mute)", textDecoration: "none", fontWeight: 400 }}>
                          {r.company.name}
                        </Link>
                      )}
                      {!r.company && r.person && (
                        <Link href={`/persons/${r.person.id}`} style={{ marginLeft: 5, color: "var(--fg-mute)", textDecoration: "none", fontWeight: 400 }}>
                          {r.person.firstName} {r.person.lastName}
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

      {/* Pipeline bar */}
      {pipeline.length > 0 && (
        <div className="panel mount mount-4">
          <div className="panel-head">
            <div className="panel-title">Pipeline · {pipelineTotal} nyitott deal</div>
            <Link href="/deals" style={{ fontSize: 11, color: "var(--indigo)" }}>Kanban →</Link>
          </div>
          <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
            {/* Progress bar */}
            <div style={{ display: "flex", height: 6, borderRadius: 4, overflow: "hidden", gap: 2 }}>
              {pipeline.map((s) => (
                <div
                  key={s.stage_name}
                  style={{ flex: Number(s.cnt), background: s.color, opacity: 0.8, minWidth: Number(s.cnt) > 0 ? 4 : 0 }}
                />
              ))}
            </div>
            {/* Stage breakdown */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {pipeline.map((s) => (
                <div key={s.stage_name} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", background: `${s.color}12`, border: `1px solid ${s.color}30`, borderRadius: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: "var(--fg-mute)" }}>{s.stage_name}</span>
                  <span className="font-mono-ndt" style={{ fontSize: 13, fontWeight: 600, color: s.color }}>{Number(s.cnt)}</span>
                  <span className="font-mono-ndt" style={{ fontSize: 10, color: "var(--fg-faint)" }}>
                    {s.total_value > 0 ? `${(s.total_value / 1_000_000).toFixed(1)}M` : "—"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
