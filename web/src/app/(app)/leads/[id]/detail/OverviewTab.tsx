import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { callbackTone } from "@/lib/leads/outcomes";
import { formatDateTime } from "@/lib/utils";

export interface OpenTask {
  id: number;
  title: string;
  dueDate: string | Date | null;
  type: string | null;
  assignedTo: { name: string } | null;
}

// Empty blocks (tasks, message) are not rendered; the qualification panel arrives as children.
export function OverviewTab({ openTasks, message, children }: { openTasks: OpenTask[]; message: string | null; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      {openTasks.length > 0 && (
        <div className="panel">
          <div className="panel-head"><div className="panel-title">Nyitott feladatok · {openTasks.length}</div></div>
          <div className="panel-pad space-y-2">
            {openTasks.map((t) => {
              const tone = callbackTone(t.dueDate);
              return (
                <div key={t.id} className="flex items-center gap-2" style={{ fontSize: 12 }}>
                  <CalendarClock style={{ width: 12, height: 12, color: tone === "overdue" ? "var(--coral)" : tone === "soon" ? "var(--amber)" : "var(--fg-faint)" }} />
                  <Link href="/tasks" className="row-link" style={{ color: "var(--fg)", flex: 1 }}>{t.title}</Link>
                  {t.assignedTo && <span style={{ color: "var(--fg-faint)" }}>{t.assignedTo.name}</span>}
                  <span className="font-mono-ndt" style={{ color: tone === "overdue" ? "var(--coral)" : "var(--fg-mute)", fontSize: 12 }}>
                    {t.dueDate ? formatDateTime(t.dueDate) : "-"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {message && (
        <div className="panel">
          <div className="panel-head"><div className="panel-title">Üzenet</div></div>
          <div className="panel-pad">
            <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--fg-soft)", whiteSpace: "pre-wrap" }}>{message}</p>
          </div>
        </div>
      )}

      {children}
    </div>
  );
}
