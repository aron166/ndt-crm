const S = {
  bar: (w: string | number, h = 14) =>
    ({
      height: h,
      width: w,
      borderRadius: 4,
      background: "var(--bg-hover)",
      flexShrink: 0,
    }) as React.CSSProperties,
};

function Pulse({ children }: { children: React.ReactNode }) {
  return <div style={{ animation: "pulse 1.5s ease-in-out infinite" }}>{children}</div>;
}

export function TablePageSkeleton({ cols = 5, rows = 12 }: { cols?: number; rows?: number }) {
  return (
    <div className="mount">
      {/* Header row */}
      <div className="flex items-end justify-between gap-4 mb-6">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Pulse><div style={S.bar(180, 22)} /></Pulse>
          <Pulse><div style={S.bar(280, 12)} /></Pulse>
        </div>
        <Pulse><div style={S.bar(220, 34)} /></Pulse>
      </div>

      {/* Table */}
      <div style={{ background: "var(--bg-panel)", border: "1px solid var(--line-soft)", borderRadius: 12, overflow: "hidden" }}>
        {/* Table header */}
        <div style={{ display: "flex", gap: 16, padding: "10px 16px", borderBottom: "1px solid var(--line-soft)", background: "oklch(0.20 0.014 255 / 0.5)" }}>
          {Array.from({ length: cols }).map((_, i) => (
            <Pulse key={i}><div style={S.bar(i === 0 ? 24 : i === 1 ? 140 : 80, 10)} /></Pulse>
          ))}
        </div>
        {/* Rows */}
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 16px", borderBottom: "1px solid var(--line-soft)", animationDelay: `${i * 40}ms` }}>
            <Pulse><div style={{ ...S.bar(32), height: 32, borderRadius: 8 }} /></Pulse>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
              <Pulse><div style={S.bar(`${55 + (i % 4) * 10}%`, 13)} /></Pulse>
              <Pulse><div style={S.bar(`${30 + (i % 3) * 8}%`, 10)} /></Pulse>
            </div>
            <Pulse><div style={S.bar(80, 20)} /></Pulse>
            <Pulse><div style={S.bar(90, 12)} /></Pulse>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DetailPageSkeleton() {
  return (
    <div className="mount space-y-4">
      {/* Back link */}
      <Pulse><div style={S.bar(140, 13)} /></Pulse>

      {/* Header card */}
      <div style={{ background: "var(--bg-panel)", border: "1px solid var(--line-soft)", borderRadius: 12, padding: 24 }}>
        <div style={{ display: "flex", gap: 18 }}>
          <Pulse><div style={{ ...S.bar(72), height: 72, borderRadius: "50%" }} /></Pulse>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
            <Pulse><div style={S.bar(220, 24)} /></Pulse>
            <Pulse><div style={S.bar(160, 14)} /></Pulse>
            <div style={{ display: "flex", gap: 16, marginTop: 4 }}>
              <Pulse><div style={S.bar(130, 12)} /></Pulse>
              <Pulse><div style={S.bar(110, 12)} /></Pulse>
            </div>
          </div>
          <Pulse><div style={{ ...S.bar(180), height: 90, borderRadius: 8 }} /></Pulse>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4 }}>
        {[80, 90, 70, 100].map((w, i) => (
          <Pulse key={i}><div style={S.bar(w, 32)} /></Pulse>
        ))}
      </div>

      {/* Content panel */}
      <div style={{ background: "var(--bg-panel)", border: "1px solid var(--line-soft)", borderRadius: 12, padding: 24 }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{ display: "flex", gap: 12, marginBottom: 20, alignItems: "flex-start" }}>
            <Pulse><div style={{ ...S.bar(8), height: 8, borderRadius: "50%", marginTop: 5 }} /></Pulse>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
              <Pulse><div style={S.bar(`${50 + (i % 5) * 10}%`, 13)} /></Pulse>
              {i % 2 === 0 && <Pulse><div style={S.bar(`${35 + (i % 3) * 8}%`, 11)} /></Pulse>}
            </div>
            <Pulse><div style={S.bar(90, 11)} /></Pulse>
          </div>
        ))}
      </div>
    </div>
  );
}

export function KanbanSkeleton({ cols = 4 }: { cols?: number }) {
  return (
    <div className="mount">
      <div className="flex items-center justify-between mb-6">
        <Pulse><div style={S.bar(160, 22)} /></Pulse>
        <Pulse><div style={S.bar(110, 34)} /></Pulse>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12 }}>
        {Array.from({ length: cols }).map((_, col) => (
          <div key={col} style={{ background: "var(--bg-panel)", border: "1px solid var(--line-soft)", borderRadius: 10, padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
              <Pulse><div style={S.bar(90, 14)} /></Pulse>
              <Pulse><div style={S.bar(24, 20)} /></Pulse>
            </div>
            {Array.from({ length: 2 + col }).map((_, i) => (
              <div key={i} style={{ background: "var(--bg-0)", border: "1px solid var(--line-soft)", borderRadius: 8, padding: 12, marginBottom: 8 }}>
                <Pulse><div style={{ ...S.bar(`${60 + (i % 3) * 15}%`), marginBottom: 8 }} /></Pulse>
                <Pulse><div style={S.bar(`${40 + (i % 2) * 20}%`, 11)} /></Pulse>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function AnalyticsSkeleton() {
  return (
    <div className="mount space-y-6">
      <div className="flex items-center justify-between">
        <Pulse><div style={S.bar(180, 26)} /></Pulse>
        <Pulse><div style={S.bar(240, 34)} /></Pulse>
      </div>
      {/* KPI strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ background: "var(--bg-panel)", border: "1px solid var(--line-soft)", borderRadius: 10, padding: 18 }}>
            <Pulse><div style={{ ...S.bar(80, 11), marginBottom: 10 }} /></Pulse>
            <Pulse><div style={{ ...S.bar(100, 28), marginBottom: 8 }} /></Pulse>
            <Pulse><div style={S.bar(140, 11)} /></Pulse>
          </div>
        ))}
      </div>
      {/* Chart panel */}
      <div style={{ background: "var(--bg-panel)", border: "1px solid var(--line-soft)", borderRadius: 12, padding: 20 }}>
        <Pulse><div style={{ ...S.bar(160, 14), marginBottom: 16 }} /></Pulse>
        <Pulse><div style={{ height: 200, width: "100%", borderRadius: 8, background: "var(--bg-hover)" }} /></Pulse>
      </div>
    </div>
  );
}
