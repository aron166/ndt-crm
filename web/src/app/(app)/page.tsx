import { db } from "@/lib/db";
import Link from "next/link";
import { formatRelativeTime, contactFreshness } from "@/lib/utils";
import { NOT_FA } from "@/lib/companies/filters";
import { PipelineStatusBadge } from "@/components/PipelineStatusBadge";
import { getActor } from "@/lib/actor";
import { countPendingForReviewer } from "@/lib/content/queries";
import { PageHeader } from "@/components/astryx/PageHeader";
import k from "@/components/astryx/page.module.css";
import h from "./home.module.css";
import { UI } from "@/lib/content/labels";

const TENANT_ID = 1;

const FRESHNESS_COLOR: Record<string, string> = {
  mint: "var(--mint)", mute: "var(--color-text-secondary)", amber: "var(--amber)", coral: "var(--coral)",
};
const INTERACTION_LABEL: Record<string, string> = {
  call: "Hívás", email: "Email", meeting: "Találkozó", site_visit: "Helyszíni", note: "Megjegyzés",
};
const INTERACTION_COLOR: Record<string, string> = {
  call: "var(--mint)", email: "var(--sky)", meeting: "var(--violet)",
  site_visit: "var(--amber)", note: "var(--color-text-secondary)",
};

export default async function DashboardPage() {
  const now = new Date();
  const todayStart = new Date(now.toDateString());
  const weekStart = new Date(todayStart.getTime() - now.getDay() * 86400000);
  const weekEnd = new Date(todayStart.getTime() + 7 * 86400000);

  const { userId } = await getActor(TENANT_ID);
  const contentPending = userId == null ? 0 : await countPendingForReviewer(TENANT_ID, userId);

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
        AND: [NOT_FA],
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
    db.company.count({ where: { tenantId: TENANT_ID, AND: [NOT_FA] } }),
    db.deal.count({ where: { tenantId: TENANT_ID, stage: { isTerminalWon: false, isTerminalLost: false } } }),
    db.task.count({ where: { tenantId: TENANT_ID, status: { in: ["created", "in_progress"] }, parentTaskId: null } }),
    db.interaction.count({ where: { tenantId: TENANT_ID, occurredAt: { gte: weekStart } } }),
  ]);

  const weekday = now.toLocaleDateString("hu-HU", { weekday: "long" });
  const dateStr = now.toLocaleDateString("hu-HU", { year: "numeric", month: "long", day: "numeric" });

  const stats = [
    { label: "Aktív cég",        value: statCompanies.toLocaleString("hu-HU"),    href: "/companies", color: "var(--sky)" },
    { label: "Nyitott deal",     value: statOpenDeals.toLocaleString("hu-HU"),     href: "/deals",     color: "var(--color-accent)" },
    { label: "Nyitott feladat",  value: statOpenTasks.toLocaleString("hu-HU"),     href: "/tasks",     color: overdueTasks.length > 0 ? "var(--coral)" : "var(--mint)" },
    { label: "Interakció / hét", value: statInteractionsWeek.toLocaleString("hu-HU"), href: "/companies", color: "var(--amber)" },
    { label: UI.inboxTitle,      value: contentPending.toLocaleString("hu-HU"),    href: "/marketing", color: contentPending > 0 ? "var(--coral)" : "var(--mint)", sub: UI.mine },
  ];

  const pipeline = pipelineStats as { stage_name: string; color: string; cnt: bigint; total_value: number }[];
  const pipelineTotal = pipeline.reduce((s, r) => s + Number(r.cnt), 0);

  return (
    <div className="mount">
      <PageHeader
        title={<span style={{ textTransform: "capitalize" }}>{weekday}</span>}
        eyebrow={dateStr}
        actions={
          <div className={h.chips}>
            {overdueTasks.length > 0 && (
              <Link href="/tasks" className={h.pill} style={{ color: "var(--coral)" }}>
                {overdueTasks.length} lejárt feladat
              </Link>
            )}
            {weekTasks > 0 && (
              <Link href="/tasks" className={h.pill} style={{ color: "var(--amber)" }}>
                {weekTasks} a héten esedékes
              </Link>
            )}
          </div>
        }
      />

      {/* Stat strip */}
      <div className={h.stats}>
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className={`${k.card} ${k.stat}`}>
            <span className={k.statV} style={{ color: s.color }}>{s.value}</span>
            <span className={k.statK}>{s.label}</span>
            {"sub" in s && s.sub && <span className={h.sub}>{s.sub}</span>}
          </Link>
        ))}
      </div>

      <div className={h.grid}>

        {/* Tasks */}
        <section className={k.section}>
          <div className={h.sectionHead}>
            <h2 className={k.h2}>
              Feladatok
              {todayTasks.length > 0 && (
                <span className={k.muted} style={{ marginLeft: 8, color: "var(--amber)" }}>
                  {todayTasks.length} ma
                </span>
              )}
            </h2>
            <Link href="/tasks" className={k.link}>Összes →</Link>
          </div>
          {overdueTasks.length === 0 && todayTasks.length === 0 ? (
            <div className={k.empty}>Nincs esedékes feladat</div>
          ) : (
            <div>
              {[...overdueTasks.map((t) => ({ t, color: "var(--color-error)" })), ...todayTasks.map((t) => ({ t, color: "var(--color-accent)" }))].map(({ t, color }) => (
                <Link key={t.id} href={`/tasks/${t.id}`} className={h.line}>
                  <span className={h.lineMain}>
                    <span className={h.dot} style={{ background: color }} />
                    <span className={h.lineText}>
                      <span className={h.ellipsis}>{t.title}</span>
                      {t.company && <span className={k.muted}>{t.company.name}</span>}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Cold companies */}
        <section className={k.section}>
          <div className={h.sectionHead}>
            <h2 className={k.h2}>Hívandók</h2>
            <Link href="/calls" className={k.link}>Hívás mód →</Link>
          </div>
          {coldCompanies.length === 0 ? (
            <div className={k.empty}>Nincs hívandó cég</div>
          ) : (
            <div>
              {coldCompanies.map((c) => {
                const fresh = contactFreshness(c.lastInteractionDate);
                return (
                  <Link key={c.id} href={`/companies/${c.id}`} className={h.line}>
                    <span className={h.lineText}>
                      <span className={h.ellipsis}>{c.name}</span>
                      <span><PipelineStatusBadge status={c.pipelineStatus} /></span>
                    </span>
                    <span className={`${k.muted} ${k.num}`} style={{ color: FRESHNESS_COLOR[fresh], flexShrink: 0 }}>
                      {formatRelativeTime(c.lastInteractionDate)}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {/* Recent interactions */}
        <section className={k.section}>
          <h2 className={k.h2}>Aktivitás</h2>
          {recentInteractions.length === 0 ? (
            <div className={k.empty}>Nincs aktivitás</div>
          ) : (
            <div>
              {recentInteractions.map((r) => {
                const color = INTERACTION_COLOR[r.type ?? "note"] ?? "var(--color-text-secondary)";
                const label = INTERACTION_LABEL[r.type ?? "note"] ?? r.type;
                return (
                  <div key={r.id} className={h.line}>
                    <span className={h.lineMain}>
                      <span className={h.dot} style={{ background: color }} />
                      <span className={h.lineText}>
                        <span className={k.strong}>
                          <span style={{ color }}>{label}</span>
                          {r.company && (
                            <Link href={`/companies/${r.company.id}`} className={k.muted} style={{ marginLeft: 6, textDecoration: "none" }}>
                              {r.company.name}
                            </Link>
                          )}
                          {!r.company && r.person && (
                            <Link href={`/persons/${r.person.id}`} className={k.muted} style={{ marginLeft: 6, textDecoration: "none" }}>
                              {r.person.firstName} {r.person.lastName}
                            </Link>
                          )}
                        </span>
                      </span>
                    </span>
                    <span className={`${k.muted} ${k.num}`}>{formatRelativeTime(r.occurredAt)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Pipeline bar */}
        {pipeline.length > 0 && (
          <section className={k.section}>
            <div className={h.sectionHead}>
              <h2 className={k.h2}>Pipeline · {pipelineTotal} nyitott deal</h2>
              <Link href="/deals" className={k.link}>Kanban →</Link>
            </div>
            <div className={h.bar}>
              {pipeline.map((s) => (
                <div
                  key={s.stage_name}
                  style={{ flex: Number(s.cnt), background: s.color, opacity: 0.8, minWidth: Number(s.cnt) > 0 ? 4 : 0 }}
                />
              ))}
            </div>
            <div className={h.stages}>
              {pipeline.map((s) => (
                <div key={s.stage_name} className={h.stage}>
                  <span className={h.dot} style={{ background: s.color }} />
                  <span className={k.muted}>{s.stage_name}</span>
                  <span className={k.strong}>{Number(s.cnt)}</span>
                  <span className={`${k.muted} ${k.num}`}>
                    {s.total_value > 0 ? `${(s.total_value / 1_000_000).toFixed(1)}M` : "-"}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
