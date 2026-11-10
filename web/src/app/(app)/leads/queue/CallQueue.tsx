import Link from "next/link";
import { leadStatusLabel, type LeadStatusDef } from "@/lib/leads/statuses";
import { groupQueue, type GroupKey, type QueueRow as Row } from "./queue-data";
import { QueueRow } from "./QueueRow";
import s from "./queue.module.css";

export function CallQueue({
  groups, statuses, now, recall, lost,
}: {
  groups: ReturnType<typeof groupQueue<Row>>;
  statuses: LeadStatusDef[];
  now: Date;
  recall: number;
  lost: number;
}) {
  return (
    <div>
      {groups.length === 0 ? (
        <div className={s.empty}>
          {/* PROPOSAL copy */}
          <span>Nincs rád osztott nyitott lead.</span>
          <Link href="/leads?owner=all" className={s.link}>Mindenki listája</Link>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.key} className={s.group} aria-labelledby={`g-${g.key}`}>
            <div className={s.groupHead}>
              <h2 id={`g-${g.key}`} className={s.groupTitle}>{g.label}</h2>
              <span className={s.muted}>{g.rows.length} lead</span> {/* PROPOSAL copy */}
            </div>
            {g.rows.map((r) => (
              <QueueRow
                key={r.id} row={r} group={g.key as GroupKey} now={now}
                stageLabel={r.status ? leadStatusLabel(r.status, statuses) : null}
              />
            ))}
          </section>
        ))
      )}
      <div className={s.footer}>
        {/* PROPOSAL copy */}
        <Link href="/leads?view=recall" className={s.link}>Visszahívásra vár: {recall} lead</Link>
        <Link href="/leads?view=lost" className={s.link}>Elveszett: {lost}</Link>
      </div>
    </div>
  );
}
