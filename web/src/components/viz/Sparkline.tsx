"use client";

import { useMemo } from "react";

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  fill?: boolean;
  animate?: boolean;
}

export function Sparkline({
  data,
  width = 120,
  height = 36,
  color = "var(--indigo)",
  fill = true,
  animate = true,
}: SparklineProps) {
  const { d, dFill, len } = useMemo(() => {
    if (!data.length) return { d: "", dFill: "", len: 0 };
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = (max - min) || 1;
    const stepX = width / (data.length - 1);
    const pts = data.map((v, i) => [
      i * stepX,
      height - ((v - min) / range) * height * 0.85 - height * 0.075,
    ]);
    const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
    const dFill = `${d} L ${width} ${height} L 0 ${height} Z`;
    return { d, dFill, len: Math.round(width * 2) };
  }, [data, width, height]);

  if (!data.length) return null;

  const gradId = `sg-${Math.random().toString(36).slice(2, 7)}`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path d={dFill} fill={`url(#${gradId})`} />}
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={animate ? "spark-path" : ""}
        style={animate ? ({ "--dashlen": len } as React.CSSProperties) : {}}
      />
    </svg>
  );
}
