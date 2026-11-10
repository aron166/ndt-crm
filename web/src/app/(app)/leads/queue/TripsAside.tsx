import Link from "next/link";
import { db } from "@/lib/db";
import s from "./queue.module.css";

const TZ = "Europe/Budapest";

export async function TripsAside({ now }: { now: Date }) {
  const tasks = await db.task.findMany({
    where: {
      tenantId: 1,
      startsAt: { gte: now, lte: new Date(now.getTime() + 10 * 86_400_000) },
      status: { notIn: ["done", "cancelled"] },
      bookingKind: { not: null },
    },
    select: {
      id: true, title: true, startsAt: true, leadId: true,
      siteSettlement: { select: { name: true } },
      lead: { select: { company: { select: { name: true } } } },
    },
    orderBy: { startsAt: "asc" },
    take: 50,
  });
  const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
  const days = new Map<string, typeof tasks>();
  for (const t of tasks) days.set(dayKey(t.startsAt!), [...(days.get(dayKey(t.startsAt!)) ?? []), t]);
  const dateLabel = (d: Date) =>
    new Intl.DateTimeFormat("hu-HU", { timeZone: TZ, weekday: "short", month: "short", day: "numeric" }).format(d);

  return (
    <aside className={s.aside} aria-label="Foglalt utak">
      {/* PROPOSAL copy */}
      <h2 className={s.asideTitle}>Foglalt utak, következő 10 nap</h2>
      {days.size === 0 && <span className={s.muted}>Nincs foglalás a következő 10 napban.</span>}
      {[...days.entries()].map(([k, list]) => {
        const towns = list.map((t) => t.siteSettlement?.name).filter((n): n is string => !!n);
        return (
          <div key={k} className={s.day}>
            <div className={s.dayHead}>
              <span className={s.dayDate}>{dateLabel(list[0].startsAt!)}</span>
              <span className={s.muted}>{list.length} helyszín</span>
            </div>
            {towns.length > 0 && <span className={s.towns}>{towns.join(" > ")}</span>}
            <ul className={s.visits}>
              {list.map((t) => {
                const label = t.lead?.company?.name || t.siteSettlement?.name || t.title;
                return (
                  <li key={t.id} className={s.muted}>
                    {t.leadId ? <Link href={`/leads/${t.leadId}`} className={s.link}>{label}</Link> : label}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </aside>
  );
}
