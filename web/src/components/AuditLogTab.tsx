import { getEntityHistory } from "@/app/actions/audit";
import { formatDateTime } from "@/lib/utils";
import type { AuditEntityType } from "@/lib/audit";
import { cn } from "@/lib/utils";

const ACTION_LABEL: Record<string, { label: string; color: string }> = {
  create: { label: "Létrehozva", color: "bg-green-50 text-green-700" },
  update: { label: "Módosítva",  color: "bg-blue-50 text-blue-700"  },
  delete: { label: "Törölve",    color: "bg-red-50 text-red-500"    },
};

const FIELD_LABELS: Record<string, string> = {
  title: "Cím", status: "Státusz", type: "Típus",
  dueDate: "Határidő", estimatedMinutes: "Tervezett perc",
  description: "Leírás", endedAt: "Lezárva", role: "Beosztás",
  direction: "Irány", occurredAt: "Időpont",
  companyId: "Cég", personId: "Személy",
};

type AuditEntry = Awaited<ReturnType<typeof getEntityHistory>>[number];

function ChangeRow({ field, before, after }: { field: string; before: unknown; after: unknown }) {
  const label = FIELD_LABELS[field] ?? field;
  const fmt = (v: unknown) =>
    v === null || v === undefined
      ? <span className="italic" style={{ color: "var(--fg-faint)" }}>—</span>
      : <span style={{ fontWeight: 500 }}>{String(v)}</span>;
  return (
    <div className="flex items-start gap-2 text-xs" style={{ color: "var(--fg-soft)" }}>
      <span className="shrink-0 w-28" style={{ color: "var(--fg-faint)" }}>{label}</span>
      <span className="line-through" style={{ color: "var(--fg-faint)" }}>{fmt(before)}</span>
      <span style={{ color: "var(--fg-faint)" }}>→</span>
      {fmt(after)}
    </div>
  );
}

// Pure display component — accepts pre-fetched data, safe to use in client components
export function AuditLogEntries({ entries }: { entries: AuditEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="text-sm py-6 text-center" style={{ color: "var(--fg-faint)" }}>
        Nincs rögzített változás. A jövőbeli módosítások itt jelennek meg.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map((e) => {
        const actionMeta = ACTION_LABEL[e.action] ?? ACTION_LABEL.update;
        const changes = e.changes as {
          before: Record<string, unknown> | null;
          after: Record<string, unknown> | null;
        };
        const changedFields = e.action === "update" ? Object.keys(changes.after ?? {}) : [];

        return (
          <div key={e.id} className="rounded-xl p-4" style={{ background: "var(--bg-panel)", border: "1px solid var(--line-soft)" }}>
            <div className="flex items-center gap-2 mb-2">
              <span className={cn("px-2 py-0.5 rounded text-xs font-medium", actionMeta.color)}>
                {actionMeta.label}
              </span>
              <span className="text-xs ml-auto" style={{ color: "var(--fg-faint)" }}>
                {formatDateTime(e.occurredAt)}
              </span>
            </div>

            {e.action === "create" && changes.after && (
              <p className="text-xs" style={{ color: "var(--fg-mute)" }}>
                {Object.entries(changes.after)
                  .filter(([, v]) => v !== null && v !== undefined && v !== "")
                  .map(([k, v]) => `${FIELD_LABELS[k] ?? k}: ${v}`)
                  .join(" · ")}
              </p>
            )}

            {e.action === "update" && changedFields.length > 0 && (
              <div className="space-y-1">
                {changedFields.map((field) => (
                  <ChangeRow key={field} field={field}
                    before={changes.before?.[field]} after={changes.after?.[field]} />
                ))}
              </div>
            )}

            {e.action === "delete" && changes.before && (
              <p className="text-xs line-through" style={{ color: "var(--fg-faint)" }}>
                {Object.entries(changes.before)
                  .filter(([, v]) => v !== null && v !== undefined)
                  .map(([k, v]) => `${FIELD_LABELS[k] ?? k}: ${v}`)
                  .join(" · ")}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Server component wrapper — only use this in server components (pages, layouts)
export async function AuditLogTab({ type, id }: { type: AuditEntityType; id: number }) {
  const entries = await getEntityHistory(type, id);
  return <AuditLogEntries entries={entries} />;
}
