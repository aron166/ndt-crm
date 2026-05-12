import { getEntityHistory } from "@/app/actions/audit";
import { formatDateTime } from "@/lib/utils";
import type { AuditEntityType } from "@/lib/audit";
import { cn } from "@/lib/utils";

const ACTION_LABEL: Record<string, { label: string; color: string }> = {
  create: { label: "Létrehozva",  color: "bg-green-50 text-green-700" },
  update: { label: "Módosítva",   color: "bg-blue-50 text-blue-700"   },
  delete: { label: "Törölve",     color: "bg-red-50 text-red-500"     },
};

const FIELD_LABELS: Record<string, string> = {
  title:            "Cím",
  status:           "Státusz",
  type:             "Típus",
  dueDate:          "Határidő",
  estimatedMinutes: "Tervezett perc",
  description:      "Leírás",
  endedAt:          "Lezárva",
  role:             "Beosztás",
  direction:        "Irány",
  occurredAt:       "Időpont",
  companyId:        "Cég",
  personId:         "Személy",
};

function ChangeRow({ field, before, after }: { field: string; before: unknown; after: unknown }) {
  const label = FIELD_LABELS[field] ?? field;
  const fmt = (v: unknown) => {
    if (v === null || v === undefined) return <span className="italic text-slate-400">—</span>;
    return <span className="font-medium">{String(v)}</span>;
  };
  return (
    <div className="flex items-start gap-2 text-xs text-slate-600">
      <span className="text-slate-400 shrink-0 w-28">{label}</span>
      <span className="line-through text-slate-400">{fmt(before)}</span>
      <span className="text-slate-400">→</span>
      {fmt(after)}
    </div>
  );
}

interface AuditLogTabProps {
  type: AuditEntityType;
  id: number;
}

export async function AuditLogTab({ type, id }: AuditLogTabProps) {
  const entries = await getEntityHistory(type, id);

  if (entries.length === 0) {
    return (
      <p className="text-sm text-slate-400 py-6 text-center">
        Nincs rögzített változás. A jövőbeli módosítások itt jelennek meg.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map((e) => {
        const actionMeta = ACTION_LABEL[e.action] ?? ACTION_LABEL.update;
        const changes = e.changes as { before: Record<string, unknown> | null; after: Record<string, unknown> | null };
        const changedFields = e.action === "update"
          ? Object.keys(changes.after ?? {})
          : [];

        return (
          <div key={e.id} className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className={cn("px-2 py-0.5 rounded text-xs font-medium", actionMeta.color)}>
                {actionMeta.label}
              </span>
              <span className="text-xs text-slate-400 ml-auto">
                {formatDateTime(e.occurredAt)}
              </span>
            </div>

            {e.action === "create" && changes.after && (
              <p className="text-xs text-slate-500">
                {Object.entries(changes.after)
                  .filter(([, v]) => v !== null && v !== undefined && v !== "")
                  .map(([k, v]) => `${FIELD_LABELS[k] ?? k}: ${v}`)
                  .join(" · ")}
              </p>
            )}

            {e.action === "update" && changedFields.length > 0 && (
              <div className="space-y-1">
                {changedFields.map((field) => (
                  <ChangeRow
                    key={field}
                    field={field}
                    before={changes.before?.[field]}
                    after={changes.after?.[field]}
                  />
                ))}
              </div>
            )}

            {e.action === "delete" && changes.before && (
              <p className="text-xs text-slate-400 line-through">
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
