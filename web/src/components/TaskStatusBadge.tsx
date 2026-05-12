const STATUS_MAP = {
  created:     { label: "Kiírva",      color: "var(--fg-mute)",  bg: "var(--bg-raised)",   border: "var(--line-soft)" },
  not_started: { label: "Kiírva",      color: "var(--fg-mute)",  bg: "var(--bg-raised)",   border: "var(--line-soft)" },
  in_progress: { label: "Folyamatban", color: "var(--indigo)",   bg: "var(--indigo-soft)", border: "var(--indigo-line)" },
  done:        { label: "Elvégezve",   color: "var(--mint)",     bg: "var(--mint-soft)",   border: "oklch(0.80 0.13 165 / 0.35)" },
  cancelled:   { label: "Törölve",     color: "var(--coral)",    bg: "var(--coral-soft)",  border: "oklch(0.72 0.18 25 / 0.35)" },
} as const;

type TaskStatus = keyof typeof STATUS_MAP;

export function TaskStatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status as TaskStatus] ?? STATUS_MAP.created;
  return (
    <span
      className="inline-flex items-center gap-1.5 font-mono-ndt"
      style={{
        height: 20, padding: "0 8px",
        fontSize: 11, fontWeight: 500,
        borderRadius: 999,
        border: `1px solid ${s.border}`,
        background: s.bg,
        color: s.color,
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          width: 5, height: 5, borderRadius: 999,
          background: "currentColor",
          boxShadow: `0 0 6px currentColor`,
          flexShrink: 0,
        }}
      />
      {s.label}
    </span>
  );
}
