"use client";

import { useEffect, useState } from "react";

function LiveClock() {
  const [time, setTime] = useState("");
  useEffect(() => {
    function tick() {
      const d = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      setTime(`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`);
    }
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);
  return <span>{time}</span>;
}

function Dot({ warn }: { warn?: boolean }) {
  return (
    <span
      className="inline-block rounded-full"
      style={{
        width: 6, height: 6,
        background: warn ? "var(--amber)" : "var(--mint)",
        boxShadow: warn ? "0 0 8px var(--amber)" : "0 0 8px var(--mint)",
        animation: "pulseDot 1.8s ease-in-out infinite",
      }}
    />
  );
}

interface StatusBarProps {
  collapsed: boolean;
  overdueCount?: number;
}

export function StatusBar({ collapsed, overdueCount = 0 }: StatusBarProps) {
  return (
    <div
      className="fixed bottom-0 right-0 flex items-center gap-4 px-4 z-20 transition-all duration-200 font-mono-ndt"
      style={{
        left: collapsed ? "3.5rem" : "240px",
        height: 26,
        background: "oklch(0.135 0.014 258 / 0.95)",
        backdropFilter: "blur(8px)",
        borderTop: "1px solid var(--line-soft)",
        fontSize: 12,
        color: "var(--fg-faint)",
        letterSpacing: "0.04em",
      }}
    >
      <span className="flex items-center gap-1.5">
        <Dot /> Supabase · live
      </span>
      {overdueCount > 0 && (
        <span className="flex items-center gap-1.5">
          <Dot warn /> {overdueCount} lejárt feladat
        </span>
      )}
      <span style={{ color: "var(--fg-faint)" }}>EU · CET</span>
      <span className="ml-auto flex items-center gap-4">
        <LiveClock />
        <span>
          v0.1 ·{" "}
          <span style={{ color: "var(--indigo)" }}>dev</span>
        </span>
      </span>
    </div>
  );
}
