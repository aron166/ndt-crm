"use client";

import { useState, useTransition } from "react";
import { saveIntegrationCredential, disconnectIntegration } from "@/app/actions/integrations";
import { sendResendTest } from "@/app/actions/email";
import { createAppApiKey, revokeAppApiKey, type AppKeyRow } from "@/app/actions/app-keys";
import { CheckCircle, Circle, ExternalLink, Zap, KeyRound, Copy, Check, Trash2, Plus } from "lucide-react";
import { formatRelativeTime } from "@/lib/utils";

interface Integration {
  slug: string;
  name: string;
  description: string;
  category: string;
  fields: { key: string; label: string; placeholder: string; type?: string }[];
  docsUrl?: string;
  available: boolean;
  testable?: boolean;
}

const INTEGRATIONS: Integration[] = [
  {
    slug: "google_maps",
    name: "Google Maps",
    description: "Cégcímek geocoding, távolságszámítás, térképwidget a céglapon.",
    category: "Helyszín",
    available: true,
    docsUrl: "https://console.cloud.google.com/apis/library/maps-backend.googleapis.com",
    fields: [{ key: "apiKey", label: "API kulcs", placeholder: "AIza..." }],
  },
  {
    slug: "google_calendar",
    name: "Google Calendar",
    description: "Feladatok és deal határidők szinkronizálása Naptárba.",
    category: "Naptár",
    available: false,
    fields: [],
  },
  {
    slug: "resend",
    name: "Resend (Email)",
    description: "Kimenő emailek küldése a CRM-ből; minden küldés interakcióként naplózódik.",
    category: "Kommunikáció",
    available: true,
    testable: true,
    docsUrl: "https://resend.com/api-keys",
    fields: [
      { key: "apiKey", label: "API kulcs", placeholder: "re_...", type: "password" },
      { key: "fromEmail", label: "Feladó email", placeholder: "peter.z.nagy@controllabor.hu" },
      { key: "fromName", label: "Feladó név", placeholder: "Nagy Péter" },
    ],
  },
  {
    slug: "twilio",
    name: "Twilio",
    description: "Hívásnapló és SMS integrálása az interakció-feedbe.",
    category: "Kommunikáció",
    available: false,
    fields: [],
  },
  {
    slug: "szamlazz",
    name: "Számlázz.hu",
    description: "Számlák importja és valós idejű szinkronizáció.",
    category: "Pénzügy",
    available: false,
    fields: [],
  },
  {
    slug: "nav",
    name: "NAV Online Számla",
    description: "Közvetlen NAV adatkapcsolat számla-validációhoz.",
    category: "Pénzügy",
    available: false,
    fields: [],
  },
];

interface SettingsClientProps {
  tenant: { id: number; name: string; slug: string } | null;
  connectedIntegrations: string[];
  appKeys: AppKeyRow[];
}

function IntegrationCard({
  integration,
  connected,
}: {
  integration: Integration;
  connected: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function handleTest() {
    setTestMsg(null);
    startTransition(async () => {
      const res = await sendResendTest();
      setTestMsg(res?.error
        ? { ok: false, text: res.error }
        : { ok: true, text: "Teszt email elküldve a feladó címre — nézd meg a postafiókod." });
    });
  }

  function handleSave() {
    startTransition(async () => {
      await saveIntegrationCredential(integration.slug, values);
      setExpanded(false);
      setValues({});
    });
  }

  function handleDisconnect() {
    startTransition(async () => {
      await disconnectIntegration(integration.slug);
    });
  }

  return (
    <div
      style={{
        background: "var(--bg-panel)", border: `1px solid ${connected ? "var(--indigo-line)" : "var(--line-soft)"}`,
        borderRadius: 10, padding: "16px 20px",
        opacity: integration.available ? 1 : 0.6,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div style={{ flex: 1 }}>
          <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
            {connected
              ? <CheckCircle style={{ width: 14, height: 14, color: "var(--mint)" }} />
              : <Circle style={{ width: 14, height: 14, color: "var(--fg-faint)" }} />
            }
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--fg)" }}>{integration.name}</span>
            <span style={{ fontSize: 10, color: "var(--fg-faint)", background: "var(--bg-hover)", padding: "1px 6px", borderRadius: 20 }}>
              {integration.category}
            </span>
            {!integration.available && (
              <span style={{ fontSize: 10, color: "var(--fg-faint)", fontFamily: "var(--font-mono)" }}>hamarosan</span>
            )}
          </div>
          <p style={{ fontSize: 12, color: "var(--fg-mute)", margin: 0, lineHeight: 1.5 }}>
            {integration.description}
          </p>
        </div>

        {integration.available && (
          <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
            {integration.docsUrl && (
              <a href={integration.docsUrl} target="_blank" rel="noopener noreferrer"
                style={{ color: "var(--fg-faint)", display: "flex" }}>
                <ExternalLink style={{ width: 13, height: 13 }} />
              </a>
            )}
            {connected ? (
              <>
                {integration.testable && (
                  <button
                    onClick={handleTest}
                    disabled={isPending}
                    style={{ fontSize: 11, padding: "4px 10px", borderRadius: 5, background: "var(--indigo-soft)", border: "1px solid var(--indigo-line)", color: "var(--indigo)", cursor: "pointer" }}
                  >
                    {isPending ? "Küldés..." : "Teszt küldése"}
                  </button>
                )}
                <button
                  onClick={handleDisconnect}
                  disabled={isPending}
                  style={{ fontSize: 11, padding: "4px 10px", borderRadius: 5, background: "transparent", border: "1px solid var(--line-soft)", color: "var(--fg-mute)", cursor: "pointer" }}
                >
                  Lecsatlakozás
                </button>
              </>
            ) : (
              <button
                onClick={() => setExpanded((e) => !e)}
                style={{ fontSize: 11, padding: "4px 10px", borderRadius: 5, background: "var(--indigo-soft)", border: "1px solid var(--indigo-line)", color: "var(--indigo)", cursor: "pointer" }}
              >
                Csatlakozás
              </button>
            )}
          </div>
        )}
      </div>

      {testMsg && (
        <p style={{ marginTop: 10, fontSize: 12, color: testMsg.ok ? "var(--mint)" : "var(--coral)" }}>
          {testMsg.ok ? "✓ " : "⚠ "}{testMsg.text}
        </p>
      )}

      {expanded && integration.fields.length > 0 && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--line-soft)", display: "flex", flexDirection: "column", gap: 8 }}>
          {integration.fields.map((f) => (
            <div key={f.key}>
              <label style={{ fontSize: 11, color: "var(--fg-mute)", display: "block", marginBottom: 4 }}>{f.label}</label>
              <input
                type={f.type ?? "text"}
                value={values[f.key] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                style={{
                  width: "100%", padding: "6px 10px", fontSize: 12,
                  background: "var(--bg-0)", border: "1px solid var(--line-soft)",
                  borderRadius: 5, color: "var(--fg)", outline: "none",
                  fontFamily: "var(--font-mono)",
                }}
              />
            </div>
          ))}
          <div className="flex gap-2 justify-end" style={{ marginTop: 4 }}>
            <button onClick={() => setExpanded(false)} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 5, background: "transparent", border: "1px solid var(--line-soft)", color: "var(--fg-mute)", cursor: "pointer" }}>
              Mégsem
            </button>
            <button
              onClick={handleSave}
              disabled={isPending || !Object.values(values).some(Boolean)}
              style={{ fontSize: 11, padding: "4px 12px", borderRadius: 5, background: "var(--indigo)", color: "white", border: "none", cursor: "pointer", opacity: Object.values(values).some(Boolean) ? 1 : 0.5 }}
            >
              Mentés
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ApiKeysSection({ appKeys }: { appKeys: AppKeyRow[] }) {
  const [appSlug, setAppSlug] = useState("");
  const [label, setLabel] = useState("");
  const [created, setCreated] = useState<{ plaintext: string; appSlug: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleCreate() {
    if (!appSlug.trim()) return;
    startTransition(async () => {
      const res = await createAppApiKey(appSlug, label);
      if (res?.success && res.plaintext) {
        setCreated({ plaintext: res.plaintext, appSlug: res.appSlug });
        setAppSlug("");
        setLabel("");
      }
    });
  }

  function handleRevoke(id: number) {
    startTransition(async () => { await revokeAppApiKey(id); });
  }

  function copyKey() {
    if (!created) return;
    navigator.clipboard.writeText(created.plaintext);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="mount space-y-5">
      <div className="flex items-center gap-3" style={{ fontSize: 12, color: "var(--fg-mute)" }}>
        <KeyRound style={{ width: 14, height: 14, color: "var(--indigo)" }} />
        Per-app kulcsok a <code style={{ fontFamily: "var(--font-mono)", color: "var(--sky)" }}>POST /api/leads</code> végponthoz. A kulcs csak hash-elve tárolódik — a teljes érték egyszer jelenik meg, létrehozáskor.
      </div>

      {/* Create */}
      <div className="panel" style={{ maxWidth: 560 }}>
        <div className="panel-head"><div className="panel-title">Új kulcs</div></div>
        <div className="panel-pad space-y-3">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <label style={{ fontSize: 11, color: "var(--fg-mute)", display: "block", marginBottom: 4 }}>App azonosító</label>
              <input
                value={appSlug}
                onChange={(e) => setAppSlug(e.target.value)}
                placeholder="betonscan_landing"
                style={{ width: "100%", padding: "6px 10px", fontSize: 12, background: "var(--bg-0)", border: "1px solid var(--line-soft)", borderRadius: 5, color: "var(--fg)", outline: "none", fontFamily: "var(--font-mono)" }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--fg-mute)", display: "block", marginBottom: 4 }}>Címke (opcionális)</label>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="BetonScan landing oldal"
                style={{ width: "100%", padding: "6px 10px", fontSize: 12, background: "var(--bg-0)", border: "1px solid var(--line-soft)", borderRadius: 5, color: "var(--fg)", outline: "none" }}
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button onClick={handleCreate} disabled={isPending || !appSlug.trim()} className="btn primary" style={{ gap: 6, opacity: appSlug.trim() ? 1 : 0.5 }}>
              <Plus style={{ width: 13, height: 13 }} />
              Kulcs létrehozása
            </button>
          </div>

          {created && (
            <div style={{ marginTop: 4, padding: "12px 14px", borderRadius: 8, background: "var(--indigo-soft)", border: "1px solid var(--indigo-line)" }}>
              <div style={{ fontSize: 11, color: "var(--amber)", marginBottom: 6, fontWeight: 500 }}>
                ⚠ Másold ki most — ez az érték többé nem jelenik meg.
              </div>
              <div className="flex items-center gap-2">
                <code style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--fg)", wordBreak: "break-all" }}>{created.plaintext}</code>
                <button onClick={copyKey} className="btn" style={{ gap: 5, flexShrink: 0 }}>
                  {copied ? <Check style={{ width: 13, height: 13, color: "var(--mint)" }} /> : <Copy style={{ width: 13, height: 13 }} />}
                  {copied ? "Másolva" : "Másolás"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Existing keys */}
      <div className="panel" style={{ maxWidth: 560 }}>
        <div className="panel-head"><div className="panel-title">Kulcsok</div></div>
        <div className="panel-pad">
          {appKeys.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--fg-mute)", padding: "8px 0" }}>Még nincs kulcs.</div>
          ) : (
            <div className="space-y-2">
              {appKeys.map((k) => (
                <div key={k.id} className="flex items-center justify-between" style={{ padding: "8px 0", borderBottom: "1px solid var(--line-soft)" }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="flex items-center gap-2">
                      <span className="font-mono-ndt" style={{ fontSize: 12, color: k.isActive ? "var(--fg)" : "var(--fg-faint)", textDecoration: k.isActive ? "none" : "line-through" }}>{k.appSlug}</span>
                      {!k.isActive && <span style={{ fontSize: 10, color: "var(--coral)" }}>visszavonva</span>}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--fg-faint)" }}>
                      {k.label ? `${k.label} · ` : ""}{k.lastUsedAt ? `utoljára ${formatRelativeTime(k.lastUsedAt)}` : "még nem használt"}
                    </div>
                  </div>
                  {k.isActive && (
                    <button onClick={() => handleRevoke(k.id)} disabled={isPending} title="Visszavonás" style={{ background: "transparent", border: "1px solid var(--line-soft)", borderRadius: 5, padding: "4px 8px", color: "var(--coral)", cursor: "pointer", display: "flex" }}>
                      <Trash2 style={{ width: 13, height: 13 }} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function SettingsClient({ tenant, connectedIntegrations, appKeys }: SettingsClientProps) {
  const [tab, setTab] = useState<"general" | "integrations" | "apikeys">("general");

  const categories = Array.from(new Set(INTEGRATIONS.map((i) => i.category)));

  return (
    <div className="mount space-y-5">
      <h1 style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em", margin: 0, color: "var(--fg)" }}>
        Beállítások
      </h1>

      <div className="tabs-ds">
        <button className={`tab-ds ${tab === "general" ? "active" : ""}`} onClick={() => setTab("general")}>
          Általános
        </button>
        <button className={`tab-ds ${tab === "integrations" ? "active" : ""}`} onClick={() => setTab("integrations")}>
          Integrációk
          {connectedIntegrations.length > 0 && (
            <span className="tcount">{connectedIntegrations.length}</span>
          )}
        </button>
        <button className={`tab-ds ${tab === "apikeys" ? "active" : ""}`} onClick={() => setTab("apikeys")}>
          API kulcsok
          {appKeys.filter((k) => k.isActive).length > 0 && (
            <span className="tcount">{appKeys.filter((k) => k.isActive).length}</span>
          )}
        </button>
      </div>

      {tab === "general" && (
        <div className="panel mount" style={{ maxWidth: 480 }}>
          <div className="panel-head"><div className="panel-title">Bérlő</div></div>
          <div className="panel-pad space-y-4">
            <div>
              <div className="field-label">Cégnév</div>
              <div className="field-value">{tenant?.name ?? "—"}</div>
            </div>
            <div>
              <div className="field-label">Slug</div>
              <div className="field-value mono">{tenant?.slug ?? "—"}</div>
            </div>
            <div style={{ paddingTop: 12, borderTop: "1px solid var(--line-soft)" }}>
              <div className="field-label">Helm CRM verzió</div>
              <div className="field-value mono" style={{ color: "var(--indigo)" }}>dev · Next.js 16 + Supabase</div>
            </div>
          </div>
        </div>
      )}

      {tab === "apikeys" && <ApiKeysSection appKeys={appKeys} />}

      {tab === "integrations" && (
        <div className="mount space-y-6">
          <div className="flex items-center gap-3" style={{ fontSize: 12, color: "var(--fg-mute)" }}>
            <Zap style={{ width: 14, height: 14, color: "var(--indigo)" }} />
            API kulcsok titkosítva tárolódnak. Integrációk bővíthetők — minden új integrációhoz csak egy <code style={{ fontFamily: "var(--font-mono)", color: "var(--sky)" }}>/lib/integrations/&lt;slug&gt;.ts</code> fájl kell.
          </div>

          {categories.map((cat) => (
            <div key={cat}>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--fg-faint)", marginBottom: 8 }}>
                {cat}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {INTEGRATIONS.filter((i) => i.category === cat).map((integration) => (
                  <IntegrationCard
                    key={integration.slug}
                    integration={integration}
                    connected={connectedIntegrations.includes(integration.slug)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
