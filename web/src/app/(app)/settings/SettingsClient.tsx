"use client";

import { useState, useTransition } from "react";
import { saveIntegrationCredential, disconnectIntegration } from "@/app/actions/integrations";
import { sendResendTest } from "@/app/actions/email";
import { createAppApiKey, revokeAppApiKey, type AppKeyRow } from "@/app/actions/app-keys";
import { CheckCircle, Circle, ExternalLink, Zap, KeyRound, Copy, Check, Trash2, Plus, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { formatRelativeTime } from "@/lib/utils";
import { PageHeader } from "@/components/astryx/PageHeader";
import k from "@/components/astryx/page.module.css";
import s from "./settings.module.css";

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
      const res = await sendResendTest().catch(() => ({ error: "Nem sikerült elküldeni a teszt emailt." }));
      setTestMsg(res && "error" in res && res.error
        ? { ok: false, text: res.error }
        : { ok: true, text: "Teszt email elküldve a feladó címre: nézd meg a postafiókod." });
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
      className={[
        k.card,
        s.integration,
        connected ? s.connected : "",
        integration.available ? "" : s.unavailable,
      ].join(" ")}
    >
      <div className={s.head}>
        <div className={s.grow}>
          <div className={s.titleLine}>
            {connected
              ? <CheckCircle style={{ width: 14, height: 14, color: "var(--mint)" }} />
              : <Circle style={{ width: 14, height: 14, color: "var(--color-text-secondary)" }} />
            }
            <span className={s.name}>{integration.name}</span>
            <span className={s.pill}>{integration.category}</span>
            {!integration.available && (
              <span className={`${k.muted} font-mono-ndt`}>hamarosan</span>
            )}
          </div>
          <p className={`${k.muted} ${s.desc}`}>
            {integration.description}
          </p>
        </div>

        {integration.available && (
          <div className={s.actions}>
            {integration.docsUrl && (
              // PROPOSAL copy: aria-label "Dokumentáció megnyitása" for the icon-only docs link
              <a href={integration.docsUrl} target="_blank" rel="noopener noreferrer"
                aria-label="Dokumentáció megnyitása" className={`${k.btn} ${k.btnIcon}`}>
                <ExternalLink style={{ width: 13, height: 13 }} />
              </a>
            )}
            {connected ? (
              <>
                {integration.testable && (
                  <button onClick={handleTest} disabled={isPending} className={k.btn}>
                    {isPending ? "Küldés..." : "Teszt küldése"}
                  </button>
                )}
                <button onClick={handleDisconnect} disabled={isPending} className={k.btn}>
                  Lecsatlakozás
                </button>
              </>
            ) : (
              <button onClick={() => setExpanded((e) => !e)} className={k.btn}>
                Csatlakozás
              </button>
            )}
          </div>
        )}
      </div>

      {testMsg && (
        <p role="status" aria-live="polite" className={`${s.msg} ${testMsg.ok ? s.ok : s.bad}`}>
          {testMsg.ok ? <Check size={14} aria-hidden="true" /> : <AlertTriangle size={14} aria-hidden="true" />} {testMsg.text}
        </p>
      )}

      {expanded && integration.fields.length > 0 && (
        <div className={s.expand}>
          {integration.fields.map((f) => (
            <div key={f.key}>
              <label className={s.label}>{f.label}</label>
              <input
                type={f.type ?? "text"}
                value={values[f.key] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                className={`${s.field} ${s.mono}`}
              />
            </div>
          ))}
          <div className={s.footer}>
            <button onClick={() => setExpanded(false)} className={k.btn}>
              Mégsem
            </button>
            <button
              onClick={handleSave}
              disabled={isPending || !Object.values(values).some(Boolean)}
              className={`${k.btn} ${k.btnPrimary}`}
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
    <div className={`mount ${s.stack}`}>
      <div className={`${k.muted} ${s.intro}`}>
        <KeyRound style={{ width: 14, height: 14, color: "var(--color-accent)" }} />
        Per-app kulcsok a <code className={s.code}>POST /api/leads</code> végponthoz. A kulcs csak hash-elve tárolódik: a teljes érték egyszer jelenik meg, létrehozáskor.
      </div>

      {/* Create */}
      <section className={`${k.card} ${s.narrow}`}>
        <h2 className={k.h2}>Új kulcs</h2>
        <div className={s.form}>
          <div className={s.fieldGrid}>
            <div>
              <label className={s.label}>App azonosító</label>
              <input
                value={appSlug}
                onChange={(e) => setAppSlug(e.target.value)}
                placeholder="betonscan_landing"
                className={`${s.field} ${s.mono}`}
              />
            </div>
            <div>
              <label className={s.label}>Címke (opcionális)</label>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="BetonRadar landing oldal"
                className={s.field}
              />
            </div>
          </div>
          <div className={s.footer}>
            <button onClick={handleCreate} disabled={isPending || !appSlug.trim()} className={`${k.btn} ${k.btnPrimary}`}>
              <Plus style={{ width: 13, height: 13 }} />
              Kulcs létrehozása
            </button>
          </div>

          {created && (
            <div className={s.created}>
              <div className={s.warnLine}>
                <AlertTriangle size={13} aria-hidden="true" /> Másold ki most: ez az érték többé nem jelenik meg.
              </div>
              <div className={s.keyLine}>
                <code className={s.keyValue}>{created.plaintext}</code>
                <button onClick={copyKey} className={k.btn}>
                  {copied ? <Check style={{ width: 13, height: 13, color: "var(--mint)" }} /> : <Copy style={{ width: 13, height: 13 }} />}
                  {copied ? "Másolva" : "Másolás"}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Existing keys */}
      <section className={`${k.card} ${s.narrow}`}>
        <h2 className={k.h2}>Kulcsok</h2>
        {appKeys.length === 0 ? (
          <div className={k.muted}>Még nincs kulcs.</div>
        ) : (
          <div>
            {appKeys.map((appKey) => (
              <div key={appKey.id} className={s.keyRow}>
                <div className={s.keyMain}>
                  <div className={s.titleLine}>
                    <span className={`font-mono-ndt ${s.keySlug} ${appKey.isActive ? "" : s.revoked}`}>{appKey.appSlug}</span>
                    {!appKey.isActive && <span className={s.bad}>visszavonva</span>}
                  </div>
                  <div className={k.muted}>
                    {appKey.label ? `${appKey.label} · ` : ""}{appKey.lastUsedAt ? `utoljára ${formatRelativeTime(appKey.lastUsedAt)}` : "még nem használt"}
                  </div>
                </div>
                {appKey.isActive && (
                  <button onClick={() => handleRevoke(appKey.id)} disabled={isPending} title="Visszavonás" aria-label="Visszavonás" className={`${k.btn} ${k.btnIcon}`}>
                    <Trash2 style={{ width: 13, height: 13 }} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export function SettingsClient({ tenant, connectedIntegrations, appKeys }: SettingsClientProps) {
  const [tab, setTab] = useState<"general" | "integrations" | "apikeys">("general");

  const categories = Array.from(new Set(INTEGRATIONS.map((i) => i.category)));

  const tabs = (
    <div className={s.tabs}>
      <button className={`${s.tab} ${tab === "general" ? s.tabOn : ""}`} onClick={() => setTab("general")}>
        Általános
      </button>
      <button className={`${s.tab} ${tab === "integrations" ? s.tabOn : ""}`} onClick={() => setTab("integrations")}>
        Integrációk
        {connectedIntegrations.length > 0 && (
          <span className={s.count}>{connectedIntegrations.length}</span>
        )}
      </button>
      <button className={`${s.tab} ${tab === "apikeys" ? s.tabOn : ""}`} onClick={() => setTab("apikeys")}>
        API kulcsok
        {appKeys.filter((ak) => ak.isActive).length > 0 && (
          <span className={s.count}>{appKeys.filter((ak) => ak.isActive).length}</span>
        )}
      </button>
    </div>
  );

  return (
    <div className={`mount ${s.stack}`}>
      <PageHeader
        title="Beállítások"
        views={tabs}
        actions={<Link href="/settings/suppressions" className={k.btn}>Tiltólista</Link>}
      />

      {tab === "general" && (
        <section className={`${k.card} ${s.narrow}`}>
          <h2 className={k.h2}>Bérlő</h2>
          <div className={k.kv}>
            <span>Cégnév</span>
            <span>{tenant?.name ?? "-"}</span>
          </div>
          <div className={k.kv}>
            <span>Slug</span>
            <span className="font-mono-ndt">{tenant?.slug ?? "-"}</span>
          </div>
          <div className={`${k.kv} ${s.divider}`}>
            <span>Helm CRM verzió</span>
            <span className={`font-mono-ndt ${s.accent}`}>dev · Next.js 16 + Supabase</span>
          </div>
        </section>
      )}

      {tab === "apikeys" && <ApiKeysSection appKeys={appKeys} />}

      {tab === "integrations" && (
        <div className={`mount ${s.stack}`}>
          <div className={`${k.muted} ${s.intro}`}>
            <Zap style={{ width: 14, height: 14, color: "var(--color-accent)" }} />
            API kulcsok titkosítva tárolódnak. Integrációk bővíthetők: minden új integrációhoz csak egy <code className={s.code}>/lib/integrations/&lt;slug&gt;.ts</code> fájl kell.
          </div>

          {categories.map((cat) => (
            <div key={cat}>
              <div className={s.catTitle}>
                {cat}
              </div>
              <div className={s.grid}>
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
