import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { callbackTone } from "@/lib/leads/outcomes";
import { formatDateTime } from "@/lib/utils";
import s from "./lead.module.css";

export interface OpenTask {
  id: number;
  title: string;
  dueDate: string | Date | null;
  type: string | null;
  assignedTo: { name: string } | null;
}

export function OpenTasks({ openTasks }: { openTasks: OpenTask[] }) {
  if (openTasks.length === 0) {
    // PROPOSAL copy
    return <p className={s.closedNote}>Nincs nyitott feladat.</p>;
  }
  return (
    <div className={s.list}>
      {openTasks.map((t) => {
        const tone = callbackTone(t.dueDate);
        const toneClass = tone === "overdue" ? s.overdue : tone === "soon" ? s.soon : "";
        return (
          <div key={t.id} className={s.row}>
            <CalendarClock size={14} className={toneClass} />
            <Link href="/tasks">{t.title}</Link>
            {t.assignedTo && <span className={s.muted}>{t.assignedTo.name}</span>}
            <span className={`${s.rowEnd} ${tone === "overdue" ? s.overdue : ""}`}>{t.dueDate ? formatDateTime(t.dueDate) : "-"}</span>
          </div>
        );
      })}
    </div>
  );
}

export function FormMessage({ message }: { message: string | null }) {
  return message ? <p className={s.quote}>{message}</p> : null;
}
