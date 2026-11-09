"use client";

import { useState } from "react";
import { CalendarClock } from "lucide-react";
import { formatDateTime } from "@/lib/utils";

// Signature element: stage, next action and due time on one band, coloured by urgency.
function dueInfo(due: Date | string | null): { rel: string; color: string } | null {
  if (!due) return null;
  const d = new Date(due);
  const now = new Date();
  const ms = d.getTime() - now.getTime();
  const hours = Math.floor(Math.abs(ms) / 3_600_000);
  const days = Math.floor(hours / 24);
  if (ms < 0) {
    // PROPOSAL copy
    return { rel: days >= 1 ? `${days} napja lejárt` : `${Math.max(hours, 1)} órája lejárt`, color: "var(--coral)" };
  }
  if (d.toDateString() === now.toDateString()) return { rel: "ma", color: "var(--amber)" };
  // PROPOSAL copy
  return { rel: days <= 1 ? "holnap" : `${days} nap múlva`, color: "var(--fg-soft)" };
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
            <span className="font-mono-ndt" style={{ fontSize: 12, color: "var(--fg-mute)" }} title="Hívási kísérletek">{attempts}/8</span>
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
