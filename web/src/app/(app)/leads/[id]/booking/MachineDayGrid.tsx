"use client";

import type { LocalDay } from "@/lib/booking/time";
import type { CheckResultDto, RankedSlotDto } from "./booking-api";
import { blockSentences, checkMachine, dayBlocks, dayKeyOf, fmtRowLabel, fmtTime, fmtWeekdayTime, geometry, REASON_LABEL, type DayBlock } from "./booking-view";
import css from "./booking.module.css";

export type Probe = CheckResultDto | "loading" | "error";

const HOURS = Array.from({ length: 13 }, (_, i) => String(6 + i).padStart(2, "0"));

function Blocks({ blocks, onlyCand, rank, slot, selected, onSelect }: {
  blocks: DayBlock[];
  onlyCand?: boolean;
  rank?: number;
  slot?: RankedSlotDto;
  selected?: boolean;
  onSelect?: () => void;
}) {
  return (
    <>
      {blocks.filter((b) => !onlyCand || b.kind === "cand").map((b, i) => {
        const g = geometry(b.start, b.end);
        const style = { left: `${g.left}%`, width: `${g.width}%` };
        if (b.kind === "drive") return <span key={i} className={`${css.blk} ${css.drive}`} style={style} title={b.tip} aria-label={b.tip} />;
        if (b.kind === "stop") return <span key={i} className={`${css.blk} ${css.stop}`} style={style} title={b.tip} aria-label={b.tip}>{b.label}</span>;
        return (
          <button
            key={i}
            type="button"
            className={`${css.blk} ${css.cand}`}
            style={style}
            title={b.tip}
            aria-pressed={selected}
            aria-label={`${rank}. javaslat, ${fmtWeekdayTime(slot!.startsAt)}`}
            onClick={onSelect}
          >
            <span className={css.rank}>{rank}</span>
            <span className={css.mono}>{fmtTime(slot!.startsAt)}</span>
          </button>
        );
      })}
    </>
  );
}

export function MachineDayGrid({ rows, slots, probes, selectedKey, keyOf, onSelect }: {
  rows: LocalDay[];
  slots: RankedSlotDto[];
  probes: Record<string, Probe | undefined>;
  selectedKey: string | null;
  keyOf: (s: RankedSlotDto) => string;
  onSelect: (s: RankedSlotDto) => void;
}) {
  return (
    <div className={css.stack}>
      <div className={css.scroll}>
        <div className={css.grid} role="group" aria-label="Gép napi terhelése">
          <span />
          <div className={css.hours} aria-hidden="true">{HOURS.map((h) => <span key={h}>{h}</span>)}</div>
          <span />
          {rows.map((day) => {
            const here = slots.filter((s) => dayKeyOf(s.startsAt) === day.key);
            const first = here[0];
            const rank = first ? slots.indexOf(first) + 1 : 0;
            const probe = probes[day.key];
            const pm = probe && typeof probe === "object" ? checkMachine(probe) : null;
            let why = "";
            let off = false;
            if (first) why = REASON_LABEL[first.reason];
            else if (probe === "loading") why = "Ellenőrzés..."; // PROPOSAL copy
            else if (pm && probe && typeof probe === "object") {
              off = !probe.feasible;
              why = off ? (blockSentences(pm)[0] ?? "Nem fér bele") : "Van hely, de rosszabb útvonal"; // PROPOSAL copy
            }
            return (
              <div key={day.key} style={{ display: "contents" }}>
                <div className={css.lbl}>
                  <span>{fmtRowLabel(day)}</span>
                  {first && <span className={css.muted}>{rank}. javaslat</span>}
                </div>
                <div className={css.track} data-off={off}>
                  {first
                    ? here.map((s, i) => (
                        <Blocks key={keyOf(s)} blocks={dayBlocks(s, true)} onlyCand={i > 0} rank={slots.indexOf(s) + 1} slot={s} selected={selectedKey === keyOf(s)} onSelect={() => onSelect(s)} />
                      ))
                    : pm && <Blocks blocks={dayBlocks(pm, false)} />}
                </div>
                <div className={css.why}>{why}</div>
              </div>
            );
          })}
        </div>
      </div>
      <span className={css.muted}>Szürke: meglévő foglalás. Szaggatott: vezetés. Keretes: javaslat. Csíkozott: nem fér bele.</span>
    </div>
  );
}
