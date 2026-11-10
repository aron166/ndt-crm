import { formatRelativeTime } from "@/lib/utils";
import type { TimelineItem } from "@/lib/leads/timeline";
import { NextStepStrip } from "../detail/NextStepStrip";
import s from "./lead2.module.css";

type Strip = React.ComponentProps<typeof NextStepStrip>;

export function Situation({ strip, last }: { strip: Strip; last: TimelineItem | null }) {
  return (
    <section className={s.card} aria-label="Helyzet">
      <h2 className={s.h2}>{/* PROPOSAL copy */}Helyzet</h2>
      <p className={s.stage}>{strip.stageLabel}</p>
      <p className={s.last}>{/* PROPOSAL copy */}{last ? `Utoljára: ${last.title}, ${formatRelativeTime(last.at)}` : "Még nem történt semmi."}</p>
      <NextStepStrip {...strip} />
    </section>
  );
}
