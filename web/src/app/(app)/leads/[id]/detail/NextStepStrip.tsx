"use client";

import { useState } from "react";
import { formatDateTime } from "@/lib/utils";
import { MAX_ATTEMPTS } from "@/lib/leads/lifecycle";
import s from "./lead.module.css";

// Signature element: stage, next action and due time on one band, coloured by urgency.
/** Calendar day in Budapest as a day number, so "ma" / "holnap" match the clock on the wall, not the server's timezone (Vanda C2). */
function budapestDay(d: Date): number {
  const [y, m, day] = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Budapest" }).format(d).split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, day) / 86_400_000);
}

export function dueInfo(due: Date | string | null, now: Date = new Date()): { rel: string; color: string } | null {
  if (!due) return null;
  const d = new Date(due);
  const ms = d.getTime() - now.getTime();
  const dayDiff = budapestDay(d) - budapestDay(now);
  if (ms < 0) {
    const hours = Math.floor(-ms / 3_600_000);
    // PROPOSAL copy
    return { rel: dayDiff <= -1 ? `${-dayDiff} napja lejárt` : `${Math.max(hours, 1)} órája lejárt`, color: "var(--coral)" };
  }
  if (dayDiff === 0) return { rel: "ma", color: "var(--amber)" };
  // PROPOSAL copy
  return { rel: dayDiff === 1 ? "holnap" : `${dayDiff} nap múlva`, color: "var(--fg-soft)" };
}

export function NextStepStrip({
  status, stageLabel, nextAction, nextDue, ownerName, attempts,
}: {
  status: string;
  stageLabel: string;
  nextAction: string | null;
  nextDue: Date | string | null;
  ownerName: string | null;
  attempts: number;
}) {
  // Animate only after the stage actually changed, never on first paint.
  const [initial] = useState(status);
  const moved = status !== initial;
  const due = dueInfo(nextDue);
  const urgency = !due ? "later" : due.color === "var(--coral)" ? "overdue" : due.color === "var(--amber)" ? "today" : "later";
  return (
    <div key={status} data-u={urgency} className={`${s.strip} ${moved ? "strip-moved" : ""}`}>
      <div className={s.lead}>
        {/* PROPOSAL copy */}
        <span className={s.k}>Következő lépés</span>
        <span className={s.v}>{nextAction || "Nincs megadott következő lépés"}</span>
      </div>
      <div>
        <span className={s.k}>Határidő</span>
        <span className={s.v}>{due && nextDue ? `${due.rel} · ${formatDateTime(nextDue)}` : "-"}</span>
      </div>
      <div><span className={s.k}>Szakasz</span><span className={s.v}>{stageLabel}</span></div>
      <div><span className={s.k}>Kísérlet</span><span className={s.v}>{attempts}/{MAX_ATTEMPTS}</span></div>
      <div><span className={s.k}>Felelős</span><span className={s.v}>{ownerName ?? "-"}</span></div>
    </div>
  );
}
