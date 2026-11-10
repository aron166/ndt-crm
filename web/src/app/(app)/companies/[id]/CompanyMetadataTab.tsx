"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, History } from "lucide-react";
import {
  COMPANY_ATTR_TYPES, COMPANY_ATTR_DEFS, attrValueLabel, partitionAttrs,
  type CompanyAttrType, type AttrRow,
} from "@/lib/companies/attributes";
import {
  setPrimaryCompanyAttribute, addSecondaryCompanyAttribute, endCompanyAttribute,
} from "@/app/actions/company-attributes";
import { formatDate } from "@/lib/utils";
import k from "@/components/astryx/page.module.css";
import s from "../companies.module.css";

interface Props {
  companyId: number;
  attributes: AttrRow[];
}

// Hoisted to module scope (NOT nested in AttrSection) so it isn't remounted on
// every keystroke — a nested component definition would drop input focus.
function AttrValueInput({ def, val, onVal, lbl, onLbl, autoFocus }: {
  def: (typeof COMPANY_ATTR_DEFS)[CompanyAttrType];
  val: string; onVal: (v: string) => void; lbl: string; onLbl: (v: string) => void; autoFocus?: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      {def.options ? (
        <select className="input-ds" value={val} onChange={(e) => onVal(e.target.value)} style={{ width: 200 }} autoFocus={autoFocus}>
          <option value="">válassz</option>
          {def.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <input className="input-ds" value={val} onChange={(e) => onVal(e.target.value)} placeholder="Érték (pl. 2511)" style={{ width: 160 }} autoFocus={autoFocus} />
      )}
      {def.primaryLabelColumn && !def.options && (
        <input className="input-ds" value={lbl} onChange={(e) => onLbl(e.target.value)} placeholder="Megnevezés" style={{ width: 220 }} />
      )}
    </div>
  );
}

export function CompanyMetadataTab({ companyId, attributes }: Props) {
  return (
    <section className={`${k.card} mount`}>
      <h2 className={k.h2}>Metaadatok</h2>
      <p className={k.muted} style={{ margin: 0, lineHeight: 1.5 }}>
        Minden érték módosítható, és a korábbi érték megmarad előzményként: nincs felülírás.
      </p>
      <div className={s.stack}>
        {COMPANY_ATTR_TYPES.map((type) => (
          <AttrSection key={type} companyId={companyId} type={type} attributes={attributes} />
        ))}
      </div>
    </section>
  );
}

function AttrSection({ companyId, type, attributes }: { companyId: number; type: CompanyAttrType; attributes: AttrRow[] }) {
  const router = useRouter();
  const def = COMPANY_ATTR_DEFS[type];
  const { current, history } = partitionAttrs(attributes, type);
  const primary = current.find((c) => c.isPrimary) ?? current[0] ?? null;
  const secondaries = current.filter((c) => c !== primary);

  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(primary?.value ?? "");
  const [label, setLabel] = useState(primary?.label ?? "");
  const [adding, setAdding] = useState(false);
  const [newVal, setNewVal] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function savePrimary() {
    setError(null);
    start(async () => {
      const res = await setPrimaryCompanyAttribute(companyId, type, value, def.primaryLabelColumn ? label : undefined);
      if (res?.error) { setError(res.error); return; }
      setEditing(false);
      router.refresh();
    });
  }
  function addSecondary() {
    setError(null);
    start(async () => {
      const res = await addSecondaryCompanyAttribute(companyId, type, newVal, newLabel || undefined);
      if (res?.error) { setError(res.error); return; }
      setAdding(false); setNewVal(""); setNewLabel("");
      router.refresh();
    });
  }
  function removeSecondary(id: number) {
    start(async () => {
      const res = await endCompanyAttribute(id);
      if (res?.error) { setError(res.error); return; }
      router.refresh();
    });
  }

  return (
    <div className={s.attr}>
      <div className={k.kv}>
        <span>
          {def.label}
          {def.multi && <span className={k.muted}> (több is lehet, egy a fő)</span>}
        </span>

        {/* Current primary */}
        <div className={s.attrBody}>
          {!editing ? (
            <div className={s.inline}>
              {primary ? (
                <span style={{ fontWeight: 500 }}>
                  {attrValueLabel(type, primary.value, primary.label)}
                  {def.multi && <span className="badge-ds indigo" style={{ marginLeft: 8 }}>fő</span>}
                </span>
              ) : (
                <span className={k.muted}>nincs megadva</span>
              )}
              <button className={k.btn} onClick={() => { setValue(primary?.value ?? ""); setLabel(primary?.label ?? ""); setEditing(true); }} disabled={pending}>
                {primary ? "Módosítás" : "Beállítás"}
              </button>
            </div>
          ) : (
            <>
              <AttrValueInput def={def} val={value} onVal={setValue} lbl={label} onLbl={setLabel} autoFocus />
              <div className={s.inline}>
                <button className={`${k.btn} ${k.btnPrimary}`} onClick={savePrimary} disabled={pending}>Mentés</button>
                <button className={k.btn} onClick={() => { setEditing(false); setError(null); }} disabled={pending}>Mégse</button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Secondary current values (multi only) */}
      {def.multi && (secondaries.length > 0 || adding) && (
        <div className={s.secChips}>
          {secondaries.map((sec) => (
            <span key={sec.id} className={s.inline} style={{ gap: 6, padding: "2px 6px 2px 10px", background: "var(--color-background-card)", border: "1px solid var(--color-border)", borderRadius: 14, fontSize: 14 }}>
              {attrValueLabel(type, sec.value, sec.label)}
              <button onClick={() => removeSecondary(sec.id)} disabled={pending} title="Lezárás (előzménybe kerül)" style={{ display: "grid", placeItems: "center", color: "var(--color-text-secondary)", background: "none", border: 0, padding: 0, cursor: "pointer" }}>
                <X style={{ width: 12, height: 12 }} />
              </button>
            </span>
          ))}
        </div>
      )}
      {def.multi && (
        adding ? (
          <div className={s.attrBody}>
            <AttrValueInput def={def} val={newVal} onVal={setNewVal} lbl={newLabel} onLbl={setNewLabel} autoFocus />
            <div className={s.inline}>
              <button className={`${k.btn} ${k.btnPrimary}`} onClick={addSecondary} disabled={pending}>Hozzáadás</button>
              <button className={k.btn} onClick={() => { setAdding(false); setError(null); }} disabled={pending}>Mégse</button>
            </div>
          </div>
        ) : (
          <div>
            <button className={k.btn} onClick={() => setAdding(true)} disabled={pending}>
              <Plus style={{ width: 12, height: 12 }} /> További {def.label}
            </button>
          </div>
        )
      )}

      {error && <div style={{ fontSize: 14, color: "var(--coral)" }}>{error}</div>}

      {/* History */}
      {history.length > 0 && (
        <div>
          <button onClick={() => setShowHistory((open) => !open)} className={s.linkBtn} style={{ display: "inline-flex", alignItems: "center", gap: 5, textDecoration: "none" }}>
            <History style={{ width: 12, height: 12 }} /> Korábbi értékek ({history.length})
          </button>
          {showHistory && (
            <div className={s.stack} style={{ gap: 4, marginTop: 6 }}>
              {history.map((h) => (
                <div key={h.id} className={s.histRow}>
                  <span style={{ color: "var(--color-text-primary)" }}>{attrValueLabel(type, h.value, h.label)}</span>
                  <span>
                    {formatDate(h.validFrom)} → {h.validTo ? formatDate(h.validTo) : "?"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
