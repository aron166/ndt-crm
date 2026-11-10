"use client";

import { useState } from "react";
import { ArrowRight, CalendarCheck, CalendarClock, FileCheck, FileText, Inbox, Mail, NotebookText, Phone } from "lucide-react";
import { formatRelativeTime } from "@/lib/utils";
import { AUTO_OUTCOME_LABELS } from "@/lib/calls/auto-outcome";
import type { TimelineItem, TimelineKind } from "@/lib/leads/timeline";
import s from "./lead2.module.css";

const ICON: Record<TimelineKind, typeof Phone> = {
  call: Phone, email: Mail, note: NotebookText, stage: ArrowRight, booking: CalendarCheck,
  task: CalendarClock, offer: FileText, document: FileCheck, form: Inbox,
};
const SHOWN = 8;

function Row({ item, autoPct, onCorrect }: { item: TimelineItem; autoPct?: number; onCorrect?: () => void }) {
  const [open, setOpen] = useState(false);
  const Icon = ICON[item.kind];
  const long = !!item.body && (item.body.length > 110 || item.body.includes("\n"));
  const meta = [item.meta, formatRelativeTime(item.at)].filter(Boolean).join(" · ");
  return (
    <li className={s.tlRow}>
      <Icon size={16} className={s.tlIcon} aria-hidden />
      <div>
        <span className={s.tlTitle}>{item.title}</span> <span className={s.tlMeta}>{meta}</span>
        {autoPct != null && (
          <>
            {" "}<span className={s.auto}>{AUTO_OUTCOME_LABELS.autoBadge}</span>
            {onCorrect && <>{" "}<button type="button" className={s.linkBtn} onClick={onCorrect} title={AUTO_OUTCOME_LABELS.autoBadgeHint.replace("{pct}", String(autoPct))}>{AUTO_OUTCOME_LABELS.correct}</button></>}
          </>
        )}
      </div>
      {item.body && (
        <p className={`${s.tlBody} ${long && !open ? s.clamp : ""}`}>
          {item.body}
          {long && <button type="button" className={s.linkBtn} onClick={() => setOpen(!open)}>{open ? "Kevesebb" : /* PROPOSAL copy */ "Tovább"}</button>}
        </p>
      )}
    </li>
  );
}

export function Timeline({ items, phone, autoPct, onCorrect }: {
  items: TimelineItem[];
  phone: string | null;
  /** interaction timeline id ("i-<id>") -> confidence percent, for auto-derived calls of THIS lead */
  autoPct: Record<string, number>;
  /** undefined when the lead is closed */
  onCorrect?: (interactionId: number) => void;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, SHOWN);
    return (
    <section className={s.card} aria-label="Történet">
      <h2 className={s.h2}>{/* PROPOSAL copy */}Történet</h2>
      {items.length === 0 && (
        <p className={s.muted}>{/* PROPOSAL copy */}Még nincs esemény.{phone && <> Hívd fel: <a href={`tel:${phone.replace(/[^\d+]/g, "")}`}>{phone}</a></>}</p>
      )}
      <ul className={s.tl}>
        {shown.map((it) => (
          <Row key={it.id} item={it} autoPct={autoPct[it.id]} onCorrect={onCorrect && it.id.startsWith("i-") ? () => onCorrect(Number(it.id.slice(2))) : undefined} />
        ))}
      </ul>
      {!all && items.length > SHOWN && (
        <button type="button" className={`${s.linkBtn} ${s.more}`} onClick={() => setAll(true)}>{/* PROPOSAL copy */}{`Korábbiak (${items.length - SHOWN})`}</button>
      )}
    </section>
  );
}
