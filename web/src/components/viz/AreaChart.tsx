"use client";

import { useEffect, useId, useRef, useState, useMemo } from "react";

interface AreaChartProps {
  data: number[];
  height?: number;
  color?: string;
}

export function AreaChart({ data, height = 180, color = "var(--indigo)" }: AreaChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);

  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const { d, dFill, pts, gridLines } = useMemo(() => {
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = (max - min) || 1;
    const pad = 8;
    const innerH = height - 36;
    const stepX = (width - pad * 2) / (data.length - 1);
    const pts = data.map((v, i) => [
      pad + i * stepX,
      20 + innerH - ((v - min) / range) * innerH * 0.85 - innerH * 0.075,
    ]);
    const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
    const dFill = `${d} L ${width - pad} ${height - 8} L ${pad} ${height - 8} Z`;
    const gridLines = Array.from({ length: 5 }, (_, i) => ({
      y: 20 + (innerH * (i / 4)),
    }));
    return { d, dFill, pts, gridLines };
  }, [data, width, height]);

  const len = Math.round(width * 2);
  const uid = useId().replace(/:/g, "");
  const gradId = `ag-${uid}`;
  const last = pts[pts.length - 1];

  return (
    <div ref={ref} style={{ width: "100%" }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.55" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {gridLines.map((g, i) => (
          <line key={i} x1={8} x2={width - 8} y1={g.y} y2={g.y}
            stroke="oklch(0.35 0.014 255 / 0.25)" strokeDasharray="2 4" />
        ))}
        <path d={dFill} fill={`url(#${gradId})`} />
        <path d={d} fill="none" stroke={color} strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
          className="spark-path" style={{ "--dashlen": len } as React.CSSProperties} />
        {last && (
          <g>
            <circle cx={last[0]} cy={last[1]} r="9" fill={color} opacity="0.18" />
            <circle cx={last[0]} cy={last[1]} r="3.5" fill={color} />
          </g>
        )}
      </svg>
    </div>
  );
}
