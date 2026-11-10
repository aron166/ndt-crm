"use client";

import { Button } from "@astryxdesign/core/Button";
import type { Suggestion } from "@/lib/leads/suggestions";
import s from "./lead2.module.css";

export function Suggestions({ items, pending, onRun }: { items: Suggestion[]; pending: boolean; onRun: (x: Suggestion) => void }) {
  if (items.length === 0) return null;
  return (
    <section className={s.card} aria-label="Javasolt lépések">
      <h2 className={s.h2}>{/* PROPOSAL copy */}Javasolt lépések</h2>
      <div className={s.suggest}>
        {items.map((x, i) => (
          <Button key={x.key} variant={i === 0 ? "primary" : "secondary"} size="lg" label={x.label} isDisabled={pending} onClick={() => onRun(x)} />
        ))}
      </div>
    </section>
  );
}
