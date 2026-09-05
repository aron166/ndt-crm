"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { AreaChart } from "@/components/viz/AreaChart";
import { StackBar } from "@/components/viz/StackBar";
import { LogInteractionModal } from "@/components/LogInteractionModal";
import { SendEmailButton } from "@/components/SendEmailButton";
import { NewQuoteDialog } from "@/app/(app)/quotes/NewQuoteDialog";
import { AddContactModal } from "./AddContactModal";
import { personLeftCompany } from "@/app/actions/contacts";
import { TagInput } from "@/components/tags/TagInput";
import { AuditLogEntries } from "@/components/AuditLogTab";
import { ContextTasksTab } from "@/components/ContextTasksTab";
import { formatDate, formatDateTime } from "@/lib/utils";
import { interactionTypeLabel, interactionDirectionLabel } from "@/lib/interactions";
import { Phone, X, MapPin, Loader2, Pencil, Trash2 } from "lucide-react";
import { geocodeCompany, deleteCompany, updateCompany, restoreCompany } from "@/app/actions/companies";
import { LeaveCompanyModal } from "@/components/LeaveCompanyModal";
import { triggerBulkEnrichment, getProposalsByRun } from "@/app/actions/enrichment";
import { EnrichmentDrawer } from "@/components/EnrichmentDrawer";
import { CompanyMetadataTab } from "./CompanyMetadataTab";
import type { AttrRow } from "@/lib/companies/attributes";
import { useState, useTransition } from "react";

interface Contact {
  id: number; personId: number; role: string | null;
  email: string | null; phone: string | null; endedAt: string | Date | null;
  person: { firstName: string | null; lastName: string | null; email: string | null; phone: string | null };
}
interface Interaction {
  id: number; type: string | null; direction: string | null;
  notes: string | null; outcome: string | null; occurredAt: string | Date;
  person: { id: number; firstName: string | null; lastName: string | null } | null;
}
interface Task {
  id: number; title: string; type: string | null; category: string | null;
  status: string; dueDate: string | Date | null; estimatedMinutes: number | null;
  description: string | null; companyId: number | null; personId: number | null;
  parentTaskId: number | null;
  costCode: string | null; costQuantity: number | null; costUnit: string | null; costUnitRate: number | null;
  _count: { subTasks: number };
}

interface AppEvent {
  id: number; sourceApp: string; eventType: string;
  payload: unknown; createdAt: string | Date;
  agent: { id: number; name: string; owner: string | null } | null;
}

interface CompanyData {
  id: number; name: string; vatNumber: string | null;
  city: string | null; county: string | null; address: string | null; zipCode: string | null; country: string | null;
  siteCity: string | null; siteStreet: string | null; siteZip: string | null; siteCounty: string | null; siteCountry: string | null;
  website: string | null; linkedinUrl: string | null; euVatNumber: string | null; leadSource: string | null;
  status: string | null; pipelineStatus: string | null; accountType: string | null; warmth: string | null;
  teaorCode: string | null; teaorDescription: string | null; industryCode: string | null; industryEn: string | null;
  scopeOfActivity: string | null;
  ndtMethods: string[]; productAreas: string[]; materials: string[]; products: string[];
  isPedCompliant: boolean | null; inspectionFrequency: string | null; hasInternalLab: boolean | null;
  competitor1: string | null; competitor2: string | null; competitor3: string | null;
  revenue2019: bigint | null; revenue2020: bigint | null; revenue2021: bigint | null;
  revenue2022: bigint | null; revenue2023: bigint | null; revenue2024: bigint | null;
  customerValue: bigint | null;
  lastInteractionDate: string | Date | null; createdAt: Date; lat?: number | null; lng?: number | null;
  deletedAt?: string | Date | null;
}

interface Props {
  company: CompanyData;
  contacts: Contact[];
  interactions: Interaction[];
  tasks: Task[];
  appEvents: AppEvent[];
  mapsConnected: boolean;
  revenueSeries: number[];
  engagementBreakdown: { label: string; value: number; color: string }[];
  kpis: { label: string; value: string | number; accent: string }[];
  avatarColor: string;
  initials: string;
  initialTags: { id: number; name: string; color: string }[];
  auditEntries: Parameters<typeof AuditLogEntries>[0]["entries"];
  attributes: AttrRow[];
}

const WARMTH_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  cold: { bg: "var(--sky-soft)",    color: "var(--sky)",    label: "Hideg" },
  warm: { bg: "var(--amber-soft)",  color: "var(--amber)",  label: "Meleg" },
  hot:  { bg: "var(--coral-soft)",  color: "var(--coral)",  label: "Forró" },
};

const NDT_METHOD_COLOR: Record<string, string> = {
  VT: "var(--sky)", PT: "var(--violet)", MT: "var(--amber)", UT: "var(--indigo)",
  RT: "var(--coral)", DRT: "var(--mint)", LT: "var(--fg-soft)", HT: "var(--amber)",
  SPECTRO: "var(--sky)", consultation: "var(--fg-mute)",
};

const PRODUCT_AREA_LABEL: Record<string, string> = {
  w: "Hegesztés", wp: "Hegeszt. előkészítés", f: "Gyártás", c: "Öntés", t: "Tesztelés", p: "Nyomástartó",
};

const MATERIAL_LABEL: Record<string, string> = { Fe: "Acél / Fe", Al: "Alumínium", Cu: "Réz", AM: "Additív" };

function formatRevenue(v: bigint | null): string {
  if (!v) return "—";
  const n = Number(v);
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} Mrd`;
  if (n >= 1_000_000) return `${Math.round(n / 1_000_000)} M`;
  return `${Math.round(n / 1_000)} e`;
}

const TYPE_COLOR: Record<string, string> = {
  call: "var(--mint)", email: "var(--sky)", meeting: "var(--violet)",
  site_visit: "var(--amber)", note: "var(--fg-mute)",
};
const TYPE_LABEL: Record<string, string> = {
  call: "Hívás", email: "Email", meeting: "Találkozó",
  site_visit: "Helyszíni látogatás", note: "Megjegyzés",
};

export function CompanyDetailClient({
  company, contacts, interactions, tasks, appEvents, mapsConnected,
  revenueSeries, engagementBreakdown, kpis, avatarColor, initials, initialTags, auditEntries, attributes,
}: Props) {
  const router = useRouter();
  const [tab, setTab] = useState("overview");
  const [logOpen, setLogOpen] = useState(false);
  const [logPerson, setLogPerson] = useState<Contact | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [leaveContact, setLeaveContact] = useState<Contact | null>(null);
  const [geocoding, startGeocode] = useTransition();
  const [geocodeMsg, setGeocodeMsg] = useState<string | null>(null);
  const [deleting, startDelete] = useTransition();
  const [editing, setEditing] = useState(false);
  const activeContact = contacts.find((c) => !c.endedAt) ?? null;
  const [form, setForm] = useState({
    name:           company.name,
    vatNumber:      company.vatNumber ?? "",
    status:         company.status ?? "",
    accountType:    company.accountType ?? "",
    pipelineStatus: company.pipelineStatus ?? "",
    city:           company.city ?? "",
    county:         company.county ?? "",
    address:        company.address ?? "",
    zipCode:        company.zipCode ?? "",
    country:        company.country ?? "",
    website:        company.website ?? "",
  });
  const [saving, startSave] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [restoring, startRestore] = useTransition();
  const isDeleted = !!company.deletedAt;
  const [enriching, startEnrich] = useTransition();
  const [enrichmentProposals, setEnrichmentProposals] = useState<Awaited<ReturnType<typeof getProposalsByRun>> | null>(null);

  function handleEnrich() {
    startEnrich(async () => {
      const runId = await triggerBulkEnrichment("company", [company.id]);
      const proposals = await getProposalsByRun(runId);
      setEnrichmentProposals(proposals);
    });
  }

  function handleCloseContact(contact: Contact) {
    setLeaveContact(contact);
  }

  function handleLeaveConfirm(endedAt: Date) {
    if (!leaveContact) return;
    const c = leaveContact;
    setLeaveContact(null);
    personLeftCompany(c.id, company.id, c.personId, endedAt).then(() => router.refresh());
  }

  function handleDelete() {
    if (!confirm(`Biztosan törölni szeretnéd a(z) "${company.name}" céget?\nEz a művelet nem vonható vissza.`)) return;
    startDelete(async () => {
      await deleteCompany(company.id);
      router.push("/companies");
    });
  }

  const hasNdtProfile = company.ndtMethods.length > 0 || company.productAreas.length > 0 || !!company.scopeOfActivity;

  const TABS = [
    { key: "overview",   label: "Áttekintés" },
    { key: "contacts",   label: `Kapcsolatok · ${contacts.filter(c => !c.endedAt).length}` },
    { key: "activity",   label: `Aktivitás · ${interactions.length}` },
    { key: "tasks",      label: `Feladatok · ${tasks.filter(t => t.status !== "done").length}` },
    ...(hasNdtProfile ? [{ key: "ndt", label: "NDT Profil" }] : []),
    { key: "metadata",   label: "Metaadatok" },
    ...(appEvents.length > 0 ? [{ key: "events", label: `Események · ${appEvents.length}` }] : []),
    { key: "history",    label: "Előzmények" },
  ];

  return (
    <>
      {logOpen && logPerson && (
        <LogInteractionModal
          open
          onClose={() => { setLogOpen(false); setLogPerson(null); router.refresh(); }}
          companyId={company.id}
          personId={logPerson.personId}
          companyName={company.name}
          personName={`${logPerson.person.firstName ?? ""} ${logPerson.person.lastName ?? ""}`.trim()}
        />
      )}
      <AddContactModal open={addOpen} onClose={() => { setAddOpen(false); router.refresh(); }} companyId={company.id} />
      {leaveContact && (
        <LeaveCompanyModal
          open
          personName={`${leaveContact.person.lastName ?? ""} ${leaveContact.person.firstName ?? ""}`.trim()}
          companyName={company.name}
          onConfirm={handleLeaveConfirm}
          onClose={() => setLeaveContact(null)}
        />
      )}
      {enrichmentProposals && (
        <EnrichmentDrawer
          proposals={enrichmentProposals as unknown as Parameters<typeof EnrichmentDrawer>[0]["proposals"]}
          onClose={() => { setEnrichmentProposals(null); router.refresh(); }}
        />
      )}

      {isDeleted && (
        <div
          className="mount"
          style={{
            display: "flex", alignItems: "center", gap: 12, marginBottom: 14,
            padding: "10px 16px", borderRadius: 8,
            background: "var(--coral-soft)", border: "1px solid var(--coral)",
          }}
        >
          <span style={{ fontSize: 14, color: "var(--fg)", flex: 1 }}>
            Ez a cég törölve van — nem jelenik meg a keresésben, és az adatai nem
            menthetők, amíg vissza nem állítod.
          </span>
          <button
            className="btn primary"
            disabled={restoring}
            onClick={() => startRestore(async () => { await restoreCompany(company.id); router.refresh(); })}
          >
            {restoring ? "Visszaállítás..." : "Visszaállítás"}
          </button>
        </div>
      )}

      {/* Detail header */}
      <div className="detail-header mount">
        <div style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>
          {/* Avatar */}
          <div style={{
            width: 72, height: 72, borderRadius: 14,
            background: avatarColor, display: "grid", placeItems: "center",
            fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: 22, color: "var(--fg)",
            position: "relative", flexShrink: 0,
          }}>
            {initials}
            <div style={{ position: "absolute", inset: 0, borderRadius: 14, boxShadow: "inset 0 1px 0 oklch(1 0 0 / 0.1), inset 0 -8px 16px oklch(0 0 0 / 0.2)" }} />
          </div>

          {/* Company info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--fg)" }}>
                {company.name}
              </h1>
            </div>
            <div style={{ marginTop: 6, color: "var(--fg-soft)", fontSize: 14, display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <span>{[company.city, company.county].filter(Boolean).join(" · ")}</span>
              {company.vatNumber && (
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--fg-faint)" }}>
                  {company.vatNumber}
                </span>
              )}
              {company.warmth && WARMTH_STYLE[company.warmth] && (
                <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 4, fontWeight: 600,
                  background: WARMTH_STYLE[company.warmth].bg, color: WARMTH_STYLE[company.warmth].color }}>
                  {WARMTH_STYLE[company.warmth].label}
                </span>
              )}
              {company.accountType && (
                <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 4, background: "var(--bg-3)", color: "var(--fg-mute)" }}>
                  {company.accountType}
                </span>
              )}
              {company.teaorCode && (
                <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--fg-faint)" }}>
                  TEÁOR {company.teaorCode}
                </span>
              )}
            </div>
            {company.scopeOfActivity && (
              <div style={{ marginTop: 6, fontSize: 14, color: "var(--fg-mute)", fontStyle: "italic", maxWidth: 600 }}>
                {company.scopeOfActivity}
              </div>
            )}
            {/* Tags */}
            <div style={{ marginTop: 12 }}>
              <TagInput taggableType="company" taggableId={company.id} initialTags={initialTags} />
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
            <button className="btn primary" onClick={() => { setLogPerson(contacts.find(c => !c.endedAt) ?? null); setLogOpen(true); }}>
              <Phone style={{ width: 13, height: 13 }} /> Naplózás
            </button>
            <SendEmailButton
              companyId={company.id}
              personId={activeContact?.personId}
              defaultTo={activeContact?.email || activeContact?.person.email || undefined}
              contextLabel={company.name}
            />
            <button className="btn" onClick={() => setAddOpen(true)}>+ Új kapcsolat</button>
            <NewQuoteDialog presetCompany={{ id: company.id, name: company.name }} triggerLabel="+ Árajánlat" triggerClassName="btn" />
            <button
              className="btn"
              onClick={handleEnrich}
              disabled={enriching}
              style={{ display: "flex", alignItems: "center", gap: 6, position: "relative" }}
            >
              <span style={{
                display: "inline-block",
                animation: enriching ? "spin 1.2s linear infinite" : "none",
                fontSize: 14,
              }}>✦</span>
              {enriching ? "Elemzés folyamatban..." : "Adatfrissítés"}
            </button>
            <button
              className="btn ghost"
              style={{ color: "var(--coral)", borderColor: "var(--coral-soft)" }}
              onClick={handleDelete}
              disabled={deleting}
              title="Cég törlése"
            >
              <Trash2 style={{ width: 11, height: 11 }} />
            </button>
          </div>
        </div>

        {/* KPI strip */}
        <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {kpis.map((k, i) => (
            <div key={i} className="kpi" style={{ "--accent": k.accent } as React.CSSProperties}>
              <div className="k-label">{k.label}</div>
              <div className="k-value">{k.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs-ds" style={{ marginTop: 18 }}>
        {TABS.map(({ key, label }) => (
          <button key={key} className={`tab-ds ${tab === key ? "active" : ""}`} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === "overview" && (
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginTop: 16, alignItems: "start" }}>
          <div className="panel mount">
            <div className="panel-head">
              <div className="panel-title">Forgalom · 24 hónap</div>
            </div>
            <div style={{ padding: 18 }}>
              {revenueSeries.length >= 2 ? (
                <AreaChart data={revenueSeries} height={180} color="var(--indigo)" />
              ) : (
                <div style={{ height: 180, display: "grid", placeItems: "center", color: "var(--fg-faint)", fontSize: 14 }}>
                  Nincs elegendő számladat a grafikonhoz.
                </div>
              )}
              <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
                {company.lastInteractionDate && (
                  <div>
                    <div className="field-label">Utolsó interakció</div>
                    <div className="field-value mono">{formatDate(company.lastInteractionDate)}</div>
                  </div>
                )}
                <div>
                  <div className="field-label">Kapcsolatok</div>
                  <div className="field-value mono">{contacts.filter(c => !c.endedAt).length} aktív</div>
                </div>
                <div>
                  <div className="field-label">Rögzítve</div>
                  <div className="field-value mono">{formatDate(company.createdAt)}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="panel mount">
            <div className="panel-head">
              <div className="panel-title">Cég adatok</div>
              <button
                className="btn sm"
                onClick={() => {
                  if (editing) {
                    setForm({
                      name:           company.name,
                      vatNumber:      company.vatNumber ?? "",
                      status:         company.status ?? "",
                      accountType:    company.accountType ?? "",
                      pipelineStatus: company.pipelineStatus ?? "",
                      city:           company.city ?? "",
                      county:         company.county ?? "",
                      address:        company.address ?? "",
                      zipCode:        company.zipCode ?? "",
                      country:        company.country ?? "",
                      website:        company.website ?? "",
                    });
                  }
                  setEditing(!editing);
                }}
              >
                {editing ? "Mégse" : <><Pencil style={{ width: 11, height: 11 }} /> Szerkesztés</>}
              </button>
            </div>
            {editing ? (
              <div className="panel-pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {(
                  [
                    { key: "name",           label: "Név",             type: "text" },
                    { key: "vatNumber",      label: "Adószám",         type: "text" },
                    { key: "city",           label: "Város",           type: "text" },
                    { key: "county",         label: "Megye",           type: "text" },
                    { key: "address",        label: "Cím",             type: "text" },
                    { key: "zipCode",        label: "Irányítószám",    type: "text" },
                    { key: "country",        label: "Ország",          type: "text" },
                    { key: "website",        label: "Website",         type: "text" },
                  ] as { key: keyof typeof form; label: string; type: string }[]
                ).map(({ key, label, type }) => (
                  <div key={key}>
                    <div className="field-label">{label}</div>
                    <input
                      type={type}
                      value={form[key]}
                      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                      style={{
                        width: "100%", fontSize: 14, padding: "5px 8px",
                        background: "var(--bg-0)", border: "1px solid var(--line-soft)",
                        borderRadius: 5, color: "var(--fg)", outline: "none",
                      }}
                    />
                  </div>
                ))}
                <div>
                  <div className="field-label">Státusz</div>
                  <select
                    value={form.status}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                    style={{ width: "100%", fontSize: 14, padding: "5px 8px", background: "var(--bg-0)", border: "1px solid var(--line-soft)", borderRadius: 5, color: "var(--fg)" }}
                  >
                    <option value="">—</option>
                    <option value="active">Aktív</option>
                    <option value="inactive">Inaktív</option>
                    <option value="fa">F.A.</option>
                  </select>
                </div>
                <div>
                  <div className="field-label">Fióktípus</div>
                  <select
                    value={form.accountType}
                    onChange={(e) => setForm((f) => ({ ...f, accountType: e.target.value }))}
                    style={{ width: "100%", fontSize: 14, padding: "5px 8px", background: "var(--bg-0)", border: "1px solid var(--line-soft)", borderRadius: 5, color: "var(--fg)" }}
                  >
                    <option value="">—</option>
                    <option value="Prospect">Prospect</option>
                    <option value="Ügyfél">Ügyfél</option>
                    <option value="Szállító">Szállító</option>
                  </select>
                </div>
                <div>
                  <div className="field-label">Pipeline státusz</div>
                  <select
                    value={form.pipelineStatus}
                    onChange={(e) => setForm((f) => ({ ...f, pipelineStatus: e.target.value }))}
                    style={{ width: "100%", fontSize: 14, padding: "5px 8px", background: "var(--bg-0)", border: "1px solid var(--line-soft)", borderRadius: 5, color: "var(--fg)" }}
                  >
                    <option value="">—</option>
                    <option value="0">0 · KUKA</option>
                    <option value="1">1 · Nem hívtuk</option>
                    <option value="2">2 · Nem válasz</option>
                    <option value="3">3 · Érdekli</option>
                    <option value="4">4 · Nem kell</option>
                    <option value="5">5 · Kéri</option>
                    <option value="6">6 · Függőben</option>
                    <option value="7">7 · Elveszett</option>
                    <option value="8">8 · Nyert</option>
                  </select>
                </div>
                <button
                  className="btn primary"
                  disabled={saving}
                  onClick={() => {
                    startSave(async () => {
                      setSaveError(null);
                      const res = await updateCompany(company.id, {
                        name:           form.name || undefined,
                        vatNumber:      form.vatNumber || undefined,
                        status:         form.status || undefined,
                        accountType:    form.accountType || undefined,
                        pipelineStatus: form.pipelineStatus || undefined,
                        city:           form.city || undefined,
                        county:         form.county || undefined,
                        address:        form.address || undefined,
                        zipCode:        form.zipCode || undefined,
                        country:        form.country || undefined,
                        website:        form.website || undefined,
                      });
                      if (res?.error) { setSaveError(res.error); return; }
                      setEditing(false);
                      router.refresh();
                    });
                  }}
                  style={{ marginTop: 4 }}
                >
                  {saving ? "Mentés..." : "Mentés"}
                </button>
                {saveError && (
                  <p style={{ fontSize: 14, color: "var(--coral)", marginTop: 6 }}>{saveError}</p>
                )}
              </div>
            ) : (
            <div className="panel-pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {company.website && (
                <div>
                  <div className="field-label">Website</div>
                  <a href={company.website.startsWith("http") ? company.website : `https://${company.website}`}
                    target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 14, color: "var(--indigo)", wordBreak: "break-all" }}>
                    {company.website.replace(/^https?:\/\//, "")}
                  </a>
                </div>
              )}
              {company.linkedinUrl && (
                <div>
                  <div className="field-label">LinkedIn</div>
                  <a href={company.linkedinUrl} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 14, color: "var(--indigo)" }}>Profil →</a>
                </div>
              )}
              {company.teaorDescription && (
                <div>
                  <div className="field-label">TEÁOR {company.teaorCode}</div>
                  <div className="field-value">{company.teaorDescription}</div>
                </div>
              )}
              {company.industryEn && (
                <div>
                  <div className="field-label">Iparág</div>
                  <div className="field-value">{company.industryEn}</div>
                </div>
              )}
              {company.leadSource && (
                <div>
                  <div className="field-label">Lead forrás</div>
                  <div className="field-value">{company.leadSource}</div>
                </div>
              )}
              {/* Revenue summary */}
              {(company.revenue2022 || company.revenue2023 || company.revenue2024) && (
                <div>
                  <div className="field-label">Éves forgalom (HUF)</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginTop: 4 }}>
                    {[
                      { year: "2022", val: company.revenue2022 },
                      { year: "2023", val: company.revenue2023 },
                      { year: "2024", val: company.revenue2024 },
                    ].map(({ year, val }) => (
                      <div key={year} style={{ textAlign: "center", padding: "6px 4px", background: "var(--bg-3)", borderRadius: 6 }}>
                        <div style={{ fontSize: 12, color: "var(--fg-faint)" }}>{year}</div>
                        <div style={{ fontSize: 14, fontFamily: "var(--font-mono)", color: "var(--fg-soft)" }}>{formatRevenue(val)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* NDT methods quick glance */}
              {company.ndtMethods.length > 0 && (
                <div>
                  <div className="field-label">NDT módszerek</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                    {company.ndtMethods.map((m) => (
                      <span key={m} style={{ fontSize: 12, padding: "2px 6px", borderRadius: 3, fontWeight: 600,
                        background: "var(--bg-3)", color: NDT_METHOD_COLOR[m] ?? "var(--fg-mute)", fontFamily: "var(--font-mono)" }}>
                        {m}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            )}

            <div className="panel-head" style={{ borderTop: "1px solid var(--line-soft)" }}><div className="panel-title">Interakció típusok</div></div>
            <div className="panel-pad">
              <StackBar segments={engagementBreakdown} />
              <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                {engagementBreakdown.map((x, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                    <span style={{ width: 6, height: 6, borderRadius: 999, background: x.color, boxShadow: `0 0 6px ${x.color}`, flexShrink: 0 }} />
                    <span style={{ flex: 1, color: "var(--fg-soft)" }}>{x.label}</span>
                    <span style={{ fontFamily: "var(--font-mono)", color: "var(--fg-mute)" }}>{x.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Map widget */}
            <div className="panel mount" style={{ marginTop: 12 }}>
              <div className="panel-head">
                <div className="panel-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <MapPin style={{ width: 13, height: 13, color: "var(--indigo)" }} />
                  Helyszín
                </div>
                {mapsConnected && (
                  <button
                    onClick={() => {
                      startGeocode(async () => {
                        const r = await geocodeCompany(company.id);
                        setGeocodeMsg(r.error ?? (r.success ? "Geocodálás sikeres" : null));
                        setTimeout(() => setGeocodeMsg(null), 3000);
                        router.refresh();
                      });
                    }}
                    disabled={geocoding}
                    style={{ fontSize: 12, padding: "3px 10px", borderRadius: 5, background: "var(--indigo-soft)", border: "1px solid var(--indigo-line)", color: "var(--indigo)", cursor: geocoding ? "wait" : "pointer", display: "flex", alignItems: "center", gap: 4 }}
                  >
                    {geocoding && <Loader2 style={{ width: 11, height: 11, animation: "spin 1s linear infinite" }} />}
                    {geocoding ? "Geocodálás..." : company.lat ? "Újra" : "Geocodálás"}
                  </button>
                )}
              </div>
              <div style={{ padding: "0 0 0" }}>
                {company.lat && company.lng ? (
                  <iframe
                    src={`https://www.google.com/maps?q=${company.lat},${company.lng}&z=15&output=embed`}
                    style={{ width: "100%", height: 200, border: "none", display: "block" }}
                    loading="lazy"
                    title={`${company.name} térképen`}
                  />
                ) : (
                  <div style={{ padding: "24px 16px", textAlign: "center", fontSize: 14, color: "var(--fg-faint)" }}>
                    {mapsConnected
                      ? "Kattints a Geocodálás gombra a cím meghatározásához."
                      : <span>Google Maps nincs csatlakoztatva. <a href="/settings" style={{ color: "var(--indigo)" }}>Beállítások →</a></span>
                    }
                  </div>
                )}
                {geocodeMsg && (
                  <div style={{ padding: "6px 16px", fontSize: 12, color: geocodeMsg.includes("siker") ? "var(--mint)" : "var(--coral)", borderTop: "1px solid var(--line-soft)" }}>
                    {geocodeMsg}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Contacts */}
      {tab === "contacts" && (
        <div className="panel mount" style={{ marginTop: 16, overflow: "hidden" }}>
          <div className="panel-head">
            <div className="panel-title">Kapcsolatok</div>
            <button className="btn sm" onClick={() => setAddOpen(true)}>+ Hozzáadás</button>
          </div>
          <table className="tbl">
            <thead>
              <tr>
                <th>Személy</th><th>Beosztás</th><th>Email</th><th>Telefon</th><th>Státusz</th><th></th>
              </tr>
            </thead>
            <tbody>
              {contacts.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--fg-faint)", padding: "32px 16px" }}>Nincs kapcsolat.</td></tr>
              )}
              {contacts.map((c) => (
                <tr key={c.id}>
                  <td className="name">
                    <Link href={`/persons/${c.personId}`} className="row-link">
                      {c.person.firstName} {c.person.lastName}
                    </Link>
                  </td>
                  <td>{c.role ?? "—"}</td>
                  <td className="num">{c.email ?? c.person.email ?? "—"}</td>
                  <td className="num">{c.phone ?? c.person.phone ?? "—"}</td>
                  <td>
                    {c.endedAt
                      ? <span style={{ fontSize: 12, color: "var(--fg-faint)" }}>Volt ({formatDate(c.endedAt)})</span>
                      : <span className="badge-ds dot mint">Aktív</span>
                    }
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                      {!c.endedAt && (
                        <>
                          <button className="btn sm" onClick={() => { setLogPerson(c); setLogOpen(true); }}>
                            <Phone style={{ width: 11, height: 11 }} /> Log
                          </button>
                          <button className="btn sm ghost" onClick={() => handleCloseContact(c)}>
                            <X style={{ width: 11, height: 11 }} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Activity */}
      {tab === "activity" && (
        <div className="panel mount" style={{ marginTop: 16, padding: "18px 22px" }}>
          {interactions.length === 0 ? (
            <div style={{ textAlign: "center", color: "var(--fg-mute)", padding: "32px 0", fontSize: 14 }}>
              Nincs interakció. Naplózáshoz kattints a Contacts fülön.
            </div>
          ) : (
            <div className="tl">
              {interactions.map((r) => {
                const accentColor = TYPE_COLOR[r.type ?? "note"] ?? "var(--fg-mute)";
                return (
                  <div key={r.id} className="tl-item" style={{ "--accent": accentColor } as React.CSSProperties}>
                    <div className="tl-dot" />
                    <div className="tl-head">
                      <span className="who">
                        <span style={{ color: accentColor, fontWeight: 500 }}>
                          {TYPE_LABEL[r.type ?? ""] ?? r.type ?? "Ismeretlen"}
                        </span>
                        {r.direction && <span style={{ color: "var(--fg-faint)", margin: "0 6px" }}>·</span>}
                        {r.direction && <span style={{ color: "var(--fg-mute)" }}>{interactionDirectionLabel(r.direction)}</span>}
                        {r.person && (
                          <>
                            <span style={{ color: "var(--fg-faint)", margin: "0 6px" }}>·</span>
                            <Link href={`/persons/${r.person.id}`} className="row-link" style={{ color: "var(--fg-mute)" }}>
                              {r.person.firstName} {r.person.lastName}
                            </Link>
                          </>
                        )}
                      </span>
                      <span className="when">{formatDateTime(r.occurredAt)}</span>
                    </div>
                    {r.notes && <div className="tl-body">{r.notes}</div>}
                    {r.outcome && <div style={{ fontSize: 12, color: "var(--fg-faint)", marginTop: 4 }}>Eredmény: {r.outcome}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tasks */}
      {tab === "tasks" && (
        <div style={{ marginTop: 16 }}>
          <ContextTasksTab tasks={tasks} companyId={company.id} companyName={company.name} />
        </div>
      )}

      {/* NDT Profil */}
      {tab === "ndt" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16, alignItems: "start" }}>
          {/* Left column: capabilities */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {company.ndtMethods.length > 0 && (
              <div className="panel mount">
                <div className="panel-head"><div className="panel-title">NDT módszerek</div></div>
                <div className="panel-pad" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {["VT","PT","MT","UT","RT","DRT","LT","HT","SPECTRO","consultation"].map((m) => {
                    const active = company.ndtMethods.includes(m);
                    return (
                      <div key={m} style={{ padding: "6px 12px", borderRadius: 6, fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 600,
                        background: active ? "var(--bg-3)" : "transparent",
                        color: active ? (NDT_METHOD_COLOR[m] ?? "var(--fg)") : "var(--fg-faint)",
                        border: `1px solid ${active ? "var(--line-soft)" : "transparent"}`,
                        opacity: active ? 1 : 0.3,
                      }}>
                        {m}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {company.productAreas.length > 0 && (
              <div className="panel mount">
                <div className="panel-head"><div className="panel-title">Termékterület</div></div>
                <div className="panel-pad" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {company.productAreas.map((pa) => (
                    <span key={pa} style={{ padding: "4px 10px", borderRadius: 5, fontSize: 14,
                      background: "var(--bg-3)", color: "var(--fg-soft)", border: "1px solid var(--line-soft)" }}>
                      {PRODUCT_AREA_LABEL[pa] ?? pa}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {company.materials.length > 0 && (
              <div className="panel mount">
                <div className="panel-head"><div className="panel-title">Vizsgált anyagok</div></div>
                <div className="panel-pad" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {company.materials.map((m) => (
                    <span key={m} style={{ padding: "4px 10px", borderRadius: 5, fontSize: 14,
                      background: "var(--bg-3)", color: "var(--amber)", fontFamily: "var(--font-mono)" }}>
                      {MATERIAL_LABEL[m] ?? m}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {company.products.length > 0 && (
              <div className="panel mount">
                <div className="panel-head"><div className="panel-title">Gyártmányok</div></div>
                <div className="panel-pad" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {company.products.map((p, i) => (
                    <span key={i} style={{ padding: "3px 8px", borderRadius: 4, fontSize: 12,
                      background: "var(--bg-3)", color: "var(--fg-mute)" }}>
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right column: inspection profile + addresses + competitors */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="panel mount">
              <div className="panel-head"><div className="panel-title">Vizsgálati profil</div></div>
              <div className="panel-pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {company.inspectionFrequency && (
                  <div>
                    <div className="field-label">Vizsgálati gyakoriság</div>
                    <div className="field-value">{company.inspectionFrequency}</div>
                  </div>
                )}
                {company.hasInternalLab !== null && (
                  <div>
                    <div className="field-label">Labor típus</div>
                    <div className="field-value">{company.hasInternalLab ? "Belső és külső labor" : "Csak külső labor"}</div>
                  </div>
                )}
                {company.isPedCompliant !== null && (
                  <div>
                    <div className="field-label">PED megfelelőség</div>
                    <div className="field-value" style={{ color: company.isPedCompliant ? "var(--mint)" : "var(--fg-mute)" }}>
                      {company.isPedCompliant ? "Igen" : "Nem"}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {(company.competitor1 || company.competitor2 || company.competitor3) && (
              <div className="panel mount">
                <div className="panel-head"><div className="panel-title">Versenytársak</div></div>
                <div className="panel-pad" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {[company.competitor1, company.competitor2, company.competitor3].filter(Boolean).map((c, i) => (
                    <div key={i} style={{ fontSize: 14, padding: "5px 8px", background: "var(--bg-3)", borderRadius: 5, color: "var(--coral)" }}>
                      {c}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(company.siteCity || company.siteStreet) && (
              <div className="panel mount">
                <div className="panel-head"><div className="panel-title">Telephely</div></div>
                <div className="panel-pad" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div className="field-label">Székhely</div>
                  <div style={{ fontSize: 14, color: "var(--fg-soft)" }}>
                    {[company.zipCode, company.city, company.address].filter(Boolean).join(", ") || "—"}
                  </div>
                  {company.siteCity && (
                    <>
                      <div className="field-label" style={{ marginTop: 8 }}>Telephely</div>
                      <div style={{ fontSize: 14, color: "var(--fg-soft)" }}>
                        {[company.siteZip, company.siteCity, company.siteStreet].filter(Boolean).join(", ")}
                      </div>
                      {company.siteCounty && (
                        <div style={{ fontSize: 12, color: "var(--fg-faint)" }}>{company.siteCounty}</div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* App Events */}
      {tab === "events" && (
        <div className="panel mount" style={{ marginTop: 16, padding: "18px 22px" }}>
          <div className="tl">
            {appEvents.map((ev) => (
              <div key={ev.id} className="tl-item" style={{ "--accent": "var(--sky)" } as React.CSSProperties}>
                <div className="tl-dot" />
                <div className="tl-head">
                  <span className="who">
                    <span className="font-mono-ndt" style={{ color: "var(--sky)", fontWeight: 500 }}>{ev.eventType}</span>
                    <span style={{ color: "var(--fg-faint)", margin: "0 6px" }}>·</span>
                    <span style={{ color: "var(--fg-mute)" }}>{ev.sourceApp}</span>
                    {ev.agent && (
                      <>
                        <span style={{ color: "var(--fg-faint)", margin: "0 6px" }}>via</span>
                        <span style={{ color: "var(--fg-soft)" }}>{ev.agent.name}</span>
                      </>
                    )}
                  </span>
                  <span className="when">{formatDateTime(ev.createdAt)}</span>
                </div>
                <div className="tl-body" style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--fg-faint)" }}>
                  {JSON.stringify(ev.payload, null, 0).slice(0, 120)}
                  {JSON.stringify(ev.payload).length > 120 ? "…" : ""}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Metadata (effective-dated attributes) */}
      {tab === "metadata" && (
        <div style={{ marginTop: 16 }}>
          <CompanyMetadataTab companyId={company.id} attributes={attributes} />
        </div>
      )}

      {/* History */}
      {tab === "history" && (
        <div className="panel mount" style={{ marginTop: 16, padding: "18px 22px" }}>
          <AuditLogEntries entries={auditEntries} />
        </div>
      )}
    </>
  );
}
