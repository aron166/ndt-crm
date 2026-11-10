"use client";

import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import type { BundleHintDto, PlacementDto, SlotReason } from "./booking-api";
import { fmtBand, fmtDate, fmtDuration, fmtTime, fmtWeekdayTime, REASON_LABEL, stopLabel, warnSentences } from "./booking-view";
import css from "./booking.module.css";

export type CardSlot = PlacementDto & { reason?: SlotReason; bundles?: BundleHintDto[] };

interface Pt { name: string; time: string | null; cand?: boolean; band?: string | null }

function WarnIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }}>
      <path d="M8 1.5 15 14H1z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8 6v4M8 11.7v.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function SlotCard({ slot, rank, selected, onSelect, baseName, machineName, onPickBundle }: {
  slot: CardSlot;
  rank?: number;
  selected: boolean;
  onSelect: () => void;
  baseName: string;
  machineName?: string;
  onPickBundle?: (b: BundleHintDto) => void;
}) {
  const pts: Pt[] = [{ name: baseName, time: slot.leaveBaseAt ? fmtTime(slot.leaveBaseAt) : null }];
  if (slot.before.stop) pts.push({ name: stopLabel(slot.before.stop), time: fmtTime(slot.before.stop.startsAt) });
  pts.push({ name: "Itt", time: fmtTime(slot.startsAt), cand: true, band: slot.before.drive ? fmtBand(slot.before.drive) : null }); // PROPOSAL copy
  if (slot.after.stop) pts.push({ name: stopLabel(slot.after.stop), time: fmtTime(slot.after.stop.startsAt), band: slot.after.drive ? fmtBand(slot.after.drive) : null });
  pts.push({ name: baseName, time: slot.homeAt ? fmtTime(slot.homeAt) : null, band: slot.after.stop ? null : slot.after.drive ? fmtBand(slot.after.drive) : null });
  // The band printed before a point belongs to the leg that arrives at it; the leg out of the base before the first stop has none.
  const warns = warnSentences(slot);
  const hints = (slot.bundles ?? []).filter((b) => !b.sameDay && b.suggestedStart);
  const others = slot.dayStops.length;

  return (
    <div className={css.card} data-selected={selected} onClick={onSelect}>
      <button type="button" className={css.head} aria-pressed={selected} aria-label={`${rank ? `${rank}. javaslat, ` : ""}${fmtWeekdayTime(slot.startsAt)}`} onClick={onSelect}>
        <span className={css.title}>
          {rank && <span className={css.rank} aria-hidden="true">{rank}</span>}
          <span>{fmtDate(slot.startsAt)}</span>
          {selected && <span className={css.muted}>(kiválasztva)</span>}
        </span>
        <span className={css.row}>
          {slot.reason && <Badge variant="info" label={REASON_LABEL[slot.reason]} />}
          <span className={css.muted}>+{Math.round(slot.addedDriveMinutes)} perc vezetés</span>
          {machineName && <span className={css.muted}>{machineName}</span>}
        </span>
      </button>

      <div className={css.route} aria-label="Útvonal">
        {pts.map((p, i) => (
          <span key={i} style={{ display: "contents" }}>
            {i > 0 && (
              <span className={css.leg}>
                <i />
                {p.band && <span>{p.band}</span>}
              </span>
            )}
            <span className={css.pt} data-cand={p.cand ? "true" : undefined}>
              <b>{p.name}</b>
              <span>{p.time ?? "-"}</span>
            </span>
          </span>
        ))}
      </div>

      <dl className={css.dl}>
        <dt>Aznap</dt>
        <dd>{others > 0 ? `${others} másik foglalás: ${slot.dayStops.map(stopLabel).join(", ")}` : "nincs más foglalás"}</dd>
        <dt>Indulás</dt>
        <dd>{slot.leaveBaseAt ? fmtTime(slot.leaveBaseAt) : "-"}</dd>
        <dt>Hazaérés</dt>
        <dd>{slot.homeAt ? fmtTime(slot.homeAt) : "-"}</dd>
        <dt>Egész nap vezetés</dt>
        <dd>{fmtDuration(slot.dayDriveMinutes)}</dd>
      </dl>

      {warns.map((w) => (
        <div key={w} className={css.warn}><WarnIcon /><span>{w}</span></div>
      ))}

      {hints.map((b) => (
        <div key={b.stop.id} className={css.hint} onClick={(e) => e.stopPropagation()}>
          <span>Egy úttal: {stopLabel(b.stop)} {fmtDate(b.stop.startsAt)} ugyanarra. Javasolt: {fmtDate(b.suggestedStart!)}</span>
          {onPickBundle && <Button size="sm" variant="secondary" label="Ezt választom" onClick={() => onPickBundle(b)} />}
        </div>
      ))}
    </div>
  );
}
