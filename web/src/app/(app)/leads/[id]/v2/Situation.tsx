import { formatDateTime, formatRelativeTime } from "@/lib/utils";
import { MAX_ATTEMPTS } from "@/lib/leads/lifecycle";
import type { TimelineItem } from "@/lib/leads/timeline";
import { dueInfo, type NextStepStrip } from "../detail/NextStepStrip";
import s from "./lead2.module.css";

type Strip = React.ComponentProps<typeof NextStepStrip>;

// Lean: owner and stage chips are already in the header, so only stage, last touch and the next step show here.
export function Situation({ strip, last }: { strip: Strip; last: TimelineItem | null }) {
  const due = dueInfo(strip.nextDue);
  return (
    <section className={s.card} aria-label="Helyzet">
      <h2 className={s.h2}>{/* PROPOSAL copy */}Helyzet</h2>
      <p className={s.stage}>{strip.stageLabel}</p>
      <p className={s.last}>{/* PROPOSAL copy */}{last ? `Utoljára: ${last.title}, ${formatRelativeTime(last.at)}` : "Még nem történt semmi."}</p>
      <p className={s.last}>
        {/* PROPOSAL copy */}
        {`Következő lépés: ${strip.nextAction || "nincs megadva"}`}
        {due && strip.nextDue ? <> · Határidő: <span style={{ color: due.color }}>{`${due.rel} · ${formatDateTime(strip.nextDue)}`}</span></> : null}
        {` · Kísérlet ${strip.attempts}/${MAX_ATTEMPTS}`}
      </p>
    </section>
  );
}
