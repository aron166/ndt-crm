const STATUS_MAP = {
  created:     { label: "Kiírva",      tone: "slate" },
  not_started: { label: "Kiírva",      tone: "slate" },
  in_progress: { label: "Folyamatban", tone: "indigo" },
  done:        { label: "Elvégezve",   tone: "mint" },
  cancelled:   { label: "Törölve",     tone: "coral" },
} as const;

type TaskStatus = keyof typeof STATUS_MAP;

export function TaskStatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status as TaskStatus] ?? STATUS_MAP.created;
  return (
    <span className={`badge-ds dot ${s.tone}`}>{s.label}</span>
  );
}
