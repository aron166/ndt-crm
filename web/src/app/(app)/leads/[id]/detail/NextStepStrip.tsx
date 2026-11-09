"use client";

import { useState } from "react";
import { CalendarClock } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import { MAX_ATTEMPTS } from "@/lib/leads/lifecycle";

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
  return (
    <div
      className="panel"
      style={{ borderLeft: `3px solid ${due ? due.color : "var(--indigo)"}`, overflow: "hidden" }}
    >
      <div key={status} className={`panel-pad space-y-1 ${moved ? "strip-moved" : ""}`}>
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono-ndt" style={{ fontSize: 12, fontWeight: 700, color: "var(--indigo)" }}>{stageLabel}</span>
          {attempts > 0 && (
            <span className="font-mono-ndt" style={{ fontSize: 12, color: "var(--fg-mute)" }} title="Hívási kísérletek">{attempts}/{MAX_ATTEMPTS}</span>
          )}
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--fg)" }}>
          {/* PROPOSAL copy */}
          {nextAction || "Nincs megadott következő lépés"}
        </div>
        {due && nextDue && (
          <div className="flex items-center gap-1.5 font-mono-ndt" style={{ fontSize: 12, color: due.color }}>
            <CalendarClock style={{ width: 12, height: 12 }} />
            {due.rel} · {formatDateTime(nextDue)}
          </div>
        )}
        {ownerName && <div style={{ fontSize: 12, color: "var(--fg-mute)" }}>{ownerName}</div>}
      </div>
    </div>
  );
}
