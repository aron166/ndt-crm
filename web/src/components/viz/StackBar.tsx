interface Segment {
  label: string;
  value: number;
  color: string;
}

interface StackBarProps {
  segments: Segment[];
  height?: number;
}

export function StackBar({ segments, height = 10 }: StackBarProps) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <div style={{ display: "flex", gap: 2, height, borderRadius: 999, overflow: "hidden", background: "var(--bg-2)" }}>
      {segments.map((s, i) => (
        <div
          key={i}
          title={`${s.label}: ${s.value}`}
          style={{
            width: `${(s.value / total) * 100}%`,
            background: s.color,
            transition: "width .6s ease",
          }}
        />
      ))}
    </div>
  );
}
