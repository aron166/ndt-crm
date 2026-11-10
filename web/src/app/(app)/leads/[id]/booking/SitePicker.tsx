"use client";

import { useEffect, useState } from "react";
import { TextInput } from "@astryxdesign/core/TextInput";
import { getSettlements, type SettlementDto } from "./booking-api";
import css from "./booking.module.css";

const validQuery = (q: string) => /^\d{4}$/.test(q) || q.length >= 2;

/** Type-ahead over /api/booking/settlements. Open when `required` or after "Másik helyszín". */
export function SitePicker({ required, onPick, onCancel }: { required: boolean; onPick: (s: SettlementDto) => void; onCancel?: () => void }) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<SettlementDto[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const query = q.trim();
    if (!validQuery(query)) return;
    let stale = false;
    const t = setTimeout(async () => {
      const r = await getSettlements(query);
      if (stale) return;
      setError(r.ok ? null : r.error);
      setItems(r.ok ? r.data.settlements.slice(0, 15) : []);
    }, 250);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [q]);

  const shown = validQuery(q.trim()) ? items : [];

  return (
    <div className={css.stack}>
      <TextInput
        label={required ? "Helyszín (kötelező)" : "Másik helyszín"} // PROPOSAL copy
        description="Település neve vagy irányítószám" // PROPOSAL copy
        value={q}
        onChange={setQ}
        autoComplete="off"
      />
      {error && <span className={css.err} role="alert">{error}</span>}
      {shown.length > 0 && (
        <div className={css.list}>
          {shown.map((s) => (
            <button key={s.id} type="button" className={css.pick} onClick={() => onPick(s)}>
              {s.name}, {s.county}, {s.postcodes[0] ?? ""}
            </button>
          ))}
        </div>
      )}
      {!required && onCancel && (
        <button type="button" className={css.link} onClick={onCancel}>Mégse</button> // PROPOSAL copy
      )}
    </div>
  );
}
