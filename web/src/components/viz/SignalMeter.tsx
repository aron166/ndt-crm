interface SignalMeterProps {
  level: number; // 0–6
  accent?: string;
}

export function SignalMeter({ level, accent = "var(--mint)" }: SignalMeterProps) {
  return (
    <div className="signal-meter" style={{ "--accent": accent } as React.CSSProperties}>
      {Array.from({ length: 6 }, (_, i) => (
        <i key={i} className={i < level ? "on" : ""} />
      ))}
    </div>
  );
}
