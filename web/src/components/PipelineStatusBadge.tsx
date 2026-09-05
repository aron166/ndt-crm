// Pipeline status: 0=KUKA 1=Nem hívtuk 2=NV 3=Érdeklődő 4=Nem érdekelt 5=Kéri 6=Folyamatban 7=CL 8=CW
const STATUS_MAP: Record<number, { label: string; color: string; bg: string; border: string }> = {
  0: { label: "KUKA",        color: "var(--fg-faint)",  bg: "var(--bg-raised)",   border: "var(--line-soft)" },
  1: { label: "Nem hívtuk",  color: "var(--fg-mute)",   bg: "var(--bg-raised)",   border: "var(--line-soft)" },
  2: { label: "NV",          color: "var(--amber)",      bg: "var(--amber-soft)",  border: "oklch(0.80 0.15 75 / 0.35)" },
  3: { label: "Érdeklődő",   color: "var(--sky)",        bg: "var(--sky-soft)",    border: "oklch(0.78 0.12 230 / 0.35)" },
  4: { label: "Nem érdekelt",color: "var(--coral)",      bg: "var(--coral-soft)",  border: "oklch(0.72 0.18 25 / 0.35)" },
  5: { label: "Kéri",        color: "var(--mint)",       bg: "var(--mint-soft)",   border: "oklch(0.80 0.13 165 / 0.35)" },
  6: { label: "Folyamatban", color: "var(--indigo)",     bg: "var(--indigo-soft)", border: "var(--indigo-line)" },
  7: { label: "CL",          color: "var(--fg-faint)",   bg: "var(--bg-raised)",   border: "var(--line-soft)" },
  8: { label: "CW",          color: "var(--mint)",       bg: "var(--mint-soft)",   border: "oklch(0.80 0.13 165 / 0.35)" },
};

export function PipelineStatusBadge({
  status,
}: {
  status: string | number | null | undefined;
}) {
  const key = status != null ? parseInt(String(status), 10) : 1;
  const s = STATUS_MAP[isNaN(key) ? 1 : key] ?? STATUS_MAP[1];
  return (
    <span
      className="inline-flex items-center gap-1.5 font-mono-ndt"
      style={{
        height: 20, padding: "0 8px",
        fontSize: 12, fontWeight: 500,
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
