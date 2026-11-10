import Link from "next/link";
import { Badge } from "@astryxdesign/core/Badge";
import { MAX_ATTEMPTS } from "@/lib/leads/lifecycle";
import { TIER_LABEL, isTier } from "@/lib/leads/tier";
import { CallButton } from "./CallButton";
import { budapestDay, type GroupKey, type QueueRow as Row } from "./queue-data";
import s from "./queue.module.css";

const TZ = "Europe/Budapest";

function relDay(due: Date, now: Date): string {
  const diff = budapestDay(due) - budapestDay(now);
  // PROPOSAL copy
  if (diff === -1) return "tegnap";
  if (diff === 0) return "ma";
  if (diff === 1) return "holnap";
  return new Intl.DateTimeFormat("hu-HU", { timeZone: TZ, month: "short", day: "numeric" }).format(due);
}

export function QueueRow({ row, group, now, stageLabel }: { row: Row; group: GroupKey; now: Date; stageLabel: string | null }) {
  const sub = [row.personName, row.role, row.town].filter(Boolean).join(", ");
  const time = row.nextDue
    ? new Intl.DateTimeFormat("hu-HU", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(row.nextDue)
    : null;
  return (
    <div className={s.qrow} data-u={group}>
      <span className={s.bar} />
      <div className={s.cell}>
        <div className={s.nameLine}>
          <Link href={`/leads/${row.id}`} className={s.name}>{row.name}</Link>
          {isTier(row.tier) && <Badge variant="neutral" label={TIER_LABEL[row.tier]} />}
        </div>
        {sub && <span className={s.muted}>{sub}</span>}
      </div>
      <div className={s.cell}>
        {/* PROPOSAL copy */}
        <span className={s.strong}>{row.nextAction || "Nincs megadott következő lépés"}</span>
        <div className={s.meta}>
          {stageLabel && <span className={s.muted}>{stageLabel}</span>}
          {row.attempts > 0 && (
            <span className={s.ticks} aria-label={`${row.attempts}. kísérlet a ${MAX_ATTEMPTS}-ból`}>
              {Array.from({ length: MAX_ATTEMPTS }, (_, i) => <i key={i} className={i < row.attempts ? s.on : ""} />)}
              <span className={s.muted}> {row.attempts}/{MAX_ATTEMPTS}</span>
            </span>
          )}
        </div>
      </div>
      <div className={s.cell}>
        {row.nextDue && time ? (
          <>
            <span className={s.time}>{time}</span>
            <span className={s.muted}>{relDay(row.nextDue, now)}</span>
          </>
        ) : <span className={s.muted}>-</span>}
      </div>
      <CallButton id={row.id} name={row.name} phone={row.phone} primary={group === "overdue"} />
    </div>
  );
}
