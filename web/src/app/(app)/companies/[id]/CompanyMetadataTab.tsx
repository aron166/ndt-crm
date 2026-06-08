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
          <option value="">— válassz —</option>
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
    <div className="panel mount" style={{ padding: "20px 24px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <span className="h-section" style={{ margin: 0 }}>Metaadatok</span>
      </div>
      <p style={{ fontSize: 12, color: "var(--fg-mute)", marginBottom: 18, lineHeight: 1.5 }}>
        Minden érték módosítható, és a korábbi érték megmarad előzményként — nincs felülírás.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        {COMPANY_ATTR_TYPES.map((type) => (
          <AttrSection key={type} companyId={companyId} type={type} attributes={attributes} />
        ))}
      </div>
    </div>
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
    <div style={{ borderBottom: "1px solid var(--line-soft)", paddingBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span className="field-label" style={{ margin: 0 }}>{def.label}</span>
        {def.multi && <span style={{ fontSize: 10, color: "var(--fg-faint)" }}>(több is lehet, egy a fő)</span>}
      </div>

      {/* Current primary */}
      {!editing ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {primary ? (
            <span style={{ fontSize: 14, color: "var(--fg)", fontWeight: 500 }}>
              {attrValueLabel(type, primary.value, primary.label)}
              {def.multi && <span className="badge-ds indigo" style={{ marginLeft: 8 }}>fő</span>}
            </span>
          ) : (
            <span style={{ fontSize: 13, color: "var(--fg-faint)" }}>nincs megadva</span>
          )}
          <button className="btn" style={{ padding: "2px 10px", fontSize: 11 }} onClick={() => { setValue(primary?.value ?? ""); setLabel(primary?.label ?? ""); setEditing(true); }} disabled={pending}>
            {primary ? "Módosítás" : "Beállítás"}
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <AttrValueInput def={def} val={value} onVal={setValue} lbl={label} onLbl={setLabel} autoFocus />
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn primary" style={{ padding: "3px 12px", fontSize: 12 }} onClick={savePrimary} disabled={pending}>Mentés</button>
            <button className="btn" style={{ padding: "3px 12px", fontSize: 12 }} onClick={() => { setEditing(false); setError(null); }} disabled={pending}>Mégse</button>
          </div>
        </div>
      )}

      {/* Secondary current values (multi only) */}
      {def.multi && (secondaries.length > 0 || adding) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
          {secondaries.map((s) => (
            <span key={s.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "2px 6px 2px 10px", background: "var(--bg-0)", border: "1px solid var(--line-soft)", borderRadius: 14, fontSize: 12 }}>
              {attrValueLabel(type, s.value, s.label)}
              <button onClick={() => removeSecondary(s.id)} disabled={pending} title="Lezárás (előzménybe kerül)" style={{ display: "grid", placeItems: "center", color: "var(--fg-faint)" }}>
                <X style={{ width: 12, height: 12 }} />
              </button>
            </span>
          ))}
        </div>
      )}
      {def.multi && (
        adding ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            <AttrValueInput def={def} val={newVal} onVal={setNewVal} lbl={newLabel} onLbl={setNewLabel} autoFocus />
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn primary" style={{ padding: "3px 12px", fontSize: 12 }} onClick={addSecondary} disabled={pending}>Hozzáadás</button>
              <button className="btn" style={{ padding: "3px 12px", fontSize: 12 }} onClick={() => { setAdding(false); setError(null); }} disabled={pending}>Mégse</button>
            </div>
          </div>
        ) : (
          <button className="btn ghost" style={{ marginTop: 8, padding: "2px 8px", fontSize: 11, display: "inline-flex", alignItems: "center", gap: 4 }} onClick={() => setAdding(true)} disabled={pending}>
            <Plus style={{ width: 12, height: 12 }} /> További {def.label}
          </button>
        )
      )}

      {error && <div style={{ fontSize: 12, color: "var(--coral)", marginTop: 8 }}>{error}</div>}

      {/* History */}
      {history.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <button onClick={() => setShowHistory((s) => !s)} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--fg-mute)" }}>
            <History style={{ width: 12, height: 12 }} /> Korábbi értékek ({history.length})
          </button>
          {showHistory && (
            <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
              {history.map((h) => (
                <div key={h.id} style={{ fontSize: 11, color: "var(--fg-mute)", display: "flex", gap: 8 }}>
                  <span style={{ color: "var(--fg-soft)" }}>{attrValueLabel(type, h.value, h.label)}</span>
                  <span style={{ color: "var(--fg-faint)", fontFamily: "var(--font-mono)" }}>
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
