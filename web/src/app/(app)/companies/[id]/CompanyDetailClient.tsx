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
import { COMPANY_ATTR_DEFS, attrValueLabel } from "@/lib/companies/attributes";
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
import { DossierTab } from "@/components/DossierTab";
import type { AttrRow } from "@/lib/companies/attributes";
import { useDeferredValue, useState, useTransition } from "react";
import { PageHeader } from "@/components/astryx/PageHeader";
import { Badge } from "@astryxdesign/core/Badge";
import k from "@/components/astryx/page.module.css";
import s from "../companies.module.css";

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
  leadId: number | null;
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
  enrichment?: unknown; closenessScore?: number | null; enrichmentUpdatedAt?: string | Date | null;
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
  kpis: { label: string; value: string | number }[];
  initials: string;
  initialTags: { id: number; name: string; color: string }[];
  auditEntries: Parameters<typeof AuditLogEntries>[0]["entries"];
  attributes: AttrRow[];
}

const WARMTH_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  cold: { bg: "var(--ui-surface-muted)", color: "var(--ui-text-muted)",   label: "Hideg" },
  warm: { bg: "var(--ui-surface-muted)", color: "var(--ui-text-muted)",   label: "Meleg" },
  hot:  { bg: "var(--ui-surface-muted)", color: "var(--ui-danger-text)",  label: "Forró" },
};


const PRODUCT_AREA_LABEL: Record<string, string> = {
  w: "Hegesztés", wp: "Hegeszt. előkészítés", f: "Gyártás", c: "Öntés", t: "Tesztelés", p: "Nyomástartó",
};

const MATERIAL_LABEL: Record<string, string> = { Fe: "Acél / Fe", Al: "Alumínium", Cu: "Réz", AM: "Additív" };

function formatRevenue(v: bigint | null): string {
  if (!v) return "-";
  const n = Number(v);
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} Mrd`;
  if (n >= 1_000_000) return `${Math.round(n / 1_000_000)} M`;
  return `${Math.round(n / 1_000)} e`;
}

const TYPE_COLOR: Record<string, string> = {
  call: "var(--ui-text-muted)", email: "var(--ui-text-muted)", meeting: "var(--ui-text-muted)",
  site_visit: "var(--ui-text-muted)", note: "var(--ui-text-muted)",
};
const TYPE_LABEL: Record<string, string> = {
  call: "Hívás", email: "Email", meeting: "Találkozó",
  site_visit: "Helyszíni látogatás", note: "Megjegyzés",
};

export function CompanyDetailClient({
  company, contacts, interactions, tasks, appEvents, mapsConnected,
  revenueSeries, engagementBreakdown, kpis, initials, initialTags, auditEntries, attributes,
}: Props) {
  const router = useRouter();
  const [tab, setTab] = useState("overview");
  // Pills read `tab` (instant highlight); tab BODIES read `shownTab`, so the
  // ~950-line body renders in a non-blocking pass instead of inside the click.
  const shownTab = useDeferredValue(tab);
  const switching = tab !== shownTab;
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
    { key: "dossier",    label: "Dosszié" },
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
            background: "var(--ui-danger-surface)", border: "1px solid var(--ui-danger)",
          }}
        >
          <span style={{ fontSize: 14, color: "var(--ui-text)", flex: 1 }}>
            Ez a cég törölve van: nem jelenik meg a keresésben, és az adatai nem
            menthetők, amíg vissza nem állítod.
          </span>
          <button
            className={`${k.btn} ${k.btnPrimary}`}
            disabled={restoring}
            onClick={() => startRestore(async () => { await restoreCompany(company.id); router.refresh(); })}
          >
            {restoring ? "Visszaállítás..." : "Visszaállítás"}
          </button>
        </div>
      )}

      {/* Detail header: name, meta line, help line, actions */}
      <PageHeader
        title={company.name}
        eyebrow={
          <span className={s.metaLine}>
            <span className={s.avatar} aria-hidden="true">
              {initials}
              <span style={{ position: "absolute", inset: 0, borderRadius: 10, boxShadow: "var(--ui-shadow-raised)" }} />
            </span>
            <span>{[company.city, company.county].filter(Boolean).join(" · ")}</span>
            {company.vatNumber && <span className={s.taxNo}>{company.vatNumber}</span>}
            {company.warmth && WARMTH_STYLE[company.warmth] && (
              <span className={s.chip} style={{ background: WARMTH_STYLE[company.warmth].bg, color: WARMTH_STYLE[company.warmth].color }}>
                {WARMTH_STYLE[company.warmth].label}
              </span>
            )}
            {company.accountType && (
              <span className={s.chip}>{attrValueLabel("account_type", company.accountType)}</span>
            )}
            {company.teaorCode && <span className={s.taxNo}>TEÁOR {company.teaorCode}</span>}
          </span>
        }
        help={company.scopeOfActivity || undefined}
        actions={
          <>
            <button className={`${k.btn} ${k.btnPrimary}`} onClick={() => { setLogPerson(contacts.find(c => !c.endedAt) ?? null); setLogOpen(true); }}>
              <Phone style={{ width: 13, height: 13 }} /> Naplózás
            </button>
            <SendEmailButton
              companyId={company.id}
              personId={activeContact?.personId}
              defaultTo={activeContact?.email || activeContact?.person.email || undefined}
              contextLabel={company.name}
            />
            <button className={k.btn} onClick={() => setAddOpen(true)}>+ Új kapcsolat</button>
            <NewQuoteDialog presetCompany={{ id: company.id, name: company.name }} triggerLabel="+ Árajánlat" triggerClassName={k.btn} />
            <button className={k.btn} onClick={handleEnrich} disabled={enriching}>
              <Loader2 size={14} aria-hidden="true" style={{ animation: enriching ? "spin 1.2s linear infinite" : "none" }} />
              {enriching ? "Elemzés folyamatban..." : "Adatfrissítés"}
            </button>
            <button
              className={`${k.btn} ${k.btnIcon}`}
              aria-label="Cég törlése" /* PROPOSAL copy */
              style={{ color: "var(--ui-danger-text)" }}
              onClick={handleDelete}
              disabled={deleting}
              title="Cég törlése"
            >
              <Trash2 style={{ width: 11, height: 11 }} />
            </button>
          </>
        }
      />

      <div className={s.tagRow}>
        <TagInput taggableType="company" taggableId={company.id} initialTags={initialTags} />
      </div>

      {/* KPI strip */}
      <div className={s.kpis}>
        {kpis.map((kpi, i) => (
          <div key={i} className={k.card}>
            <div className={k.stat}>
              <span className={k.statK}>{kpi.label}</span>
              <span className={k.statV}>{kpi.value}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className={k.seg} role="tablist" aria-busy={switching}>
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            className={`${k.segItem} ${s.tabBtn} ${tab === key ? k.segItemOn : ""}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* While a tab body is still rendering (useDeferredValue), the new pill is
          already lit but the OLD body is on screen — and was still clickable.
          `inert` blocks pointer AND keyboard against the tab the user just left.
          No dimming: useDeferredValue always paints one urgent frame with the old
          value, so an opacity transition fires on EVERY switch including the
          instant ones. (Vanda, PR #83.) */}
      <div inert={switching}>

      {/* Overview */}
      {shownTab === "overview" && (
        <div className={`${k.split} ${s.tabBody}`}>
          <div className={s.stack}>
            <section className={`${k.card} mount`}>
              <h2 className={k.h2}>Forgalom · 24 hónap</h2>
              {revenueSeries.length >= 2 ? (
                <AreaChart data={revenueSeries} height={180} color="var(--ui-accent)" />
              ) : (
                <div className={s.chartEmpty}>Nincs elegendő számladat a grafikonhoz.</div>
              )}
              {company.lastInteractionDate && (
                <div className={k.kv}>
                  <span>Utolsó interakció</span>
                  <span className={k.num}>{formatDate(company.lastInteractionDate)}</span>
                </div>
              )}
              <div className={k.kv}>
                <span>Kapcsolatok</span>
                <span className={k.num}>{contacts.filter(c => !c.endedAt).length} aktív</span>
              </div>
              <div className={k.kv}>
                <span>Rögzítve</span>
                <span className={k.num}>{formatDate(company.createdAt)}</span>
              </div>
            </section>
          </div>

          <div className={s.stack}>
            <section className={`${k.card} mount`}>
              <div className={s.head}>
                <h2 className={k.h2}>Cég adatok</h2>
                <button
                  className={k.btn}
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
              <div className={s.form}>
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
                    <div className={k.muted}>{label}</div>
                    <input
                      className={s.formInput}
                      type={type}
                      value={form[key]}
                      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                      style={{
                        width: "100%", fontSize: 14, padding: "5px 8px",
                        background: "var(--ui-surface)", border: "1px solid var(--ui-border)",
                        borderRadius: 5, color: "var(--ui-text)",
                      }}
                    />
                  </div>
                ))}
                <div>
                  <div className={k.muted}>Státusz</div>
                  <select
                    className={s.formInput}
                    value={form.status}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                    style={{ width: "100%", fontSize: 14, padding: "5px 8px", background: "var(--ui-surface)", border: "1px solid var(--ui-border)", borderRadius: 5, color: "var(--ui-text)" }}
                  >
                    <option value="">-</option>
                    {COMPANY_ATTR_DEFS.status.options!.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
                  </select>
                </div>
                <div>
                  <div className={k.muted}>Fióktípus</div>
                  <select
                    className={s.formInput}
                    value={form.accountType}
                    onChange={(e) => setForm((f) => ({ ...f, accountType: e.target.value }))}
                    style={{ width: "100%", fontSize: 14, padding: "5px 8px", background: "var(--ui-surface)", border: "1px solid var(--ui-border)", borderRadius: 5, color: "var(--ui-text)" }}
                  >
                    <option value="">-</option>
                    {COMPANY_ATTR_DEFS.account_type.options!.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
                  </select>
                </div>
                <div>
                  <div className={k.muted}>Pipeline státusz</div>
                  <select
                    className={s.formInput}
                    value={form.pipelineStatus}
                    onChange={(e) => setForm((f) => ({ ...f, pipelineStatus: e.target.value }))}
                    style={{ width: "100%", fontSize: 14, padding: "5px 8px", background: "var(--ui-surface)", border: "1px solid var(--ui-border)", borderRadius: 5, color: "var(--ui-text)" }}
                  >
                    <option value="">-</option>
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
                  className={`${k.btn} ${k.btnPrimary}`}
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
                  <p style={{ fontSize: 14, color: "var(--ui-danger-text)", marginTop: 6 }}>{saveError}</p>
                )}
              </div>
            ) : (
            <>
              {company.website && (
                <div className={k.kv}>
                  <span>Website</span>
                  <a href={company.website.startsWith("http") ? company.website : `https://${company.website}`}
                    target="_blank" rel="noopener noreferrer"
                    className={k.link} style={{ wordBreak: "break-all" }}>
                    {company.website.replace(/^https?:\/\//, "")}
                  </a>
                </div>
              )}
              {company.linkedinUrl && (
                <div className={k.kv}>
                  <span>LinkedIn</span>
                  <a href={company.linkedinUrl} target="_blank" rel="noopener noreferrer" className={k.link}>Profil →</a>
                </div>
              )}
              {company.teaorDescription && (
                <div className={k.kv}>
                  <span>TEÁOR {company.teaorCode}</span>
                  <span>{company.teaorDescription}</span>
                </div>
              )}
              {company.industryEn && (
                <div className={k.kv}>
                  <span>Iparág</span>
                  <span>{company.industryEn}</span>
                </div>
              )}
              {company.leadSource && (
                <div className={k.kv}>
                  <span>Lead forrás</span>
                  <span>{company.leadSource}</span>
                </div>
              )}
              {/* Revenue summary */}
              {(company.revenue2022 || company.revenue2023 || company.revenue2024) && (
                <div className={k.kv}>
                  <span>Éves forgalom (HUF)</span>
                  <span className={s.yearTiles}>
                    {[
                      { year: "2022", val: company.revenue2022 },
                      { year: "2023", val: company.revenue2023 },
                      { year: "2024", val: company.revenue2024 },
                    ].map(({ year, val }) => (
                      <span key={year} className={s.yearTile}>
                        <span className={k.statK} style={{ display: "block" }}>{year}</span>
                        <span className={k.num} style={{ fontSize: 14, color: "var(--ui-text)" }}>{formatRevenue(val)}</span>
                      </span>
                    ))}
                  </span>
                </div>
              )}
              {/* NDT methods quick glance */}
              {company.ndtMethods.length > 0 && (
                <div className={k.kv}>
                  <span>NDT módszerek</span>
                  <span className={s.chips}>
                    {company.ndtMethods.map((m) => (
                      <span key={m} style={{ fontSize: 12, padding: "2px 6px", borderRadius: 3, fontWeight: 600,
                        background: "var(--ui-surface-muted)", color: "var(--ui-text-muted)" }}>
                        {m}
                      </span>
                    ))}
                  </span>
                </div>
              )}
            </>
            )}
            </section>

            <section className={`${k.card} mount`}>
              <h2 className={k.h2}>Interakció típusok</h2>
              <StackBar segments={engagementBreakdown} />
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {engagementBreakdown.map((x, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                    <span style={{ width: 6, height: 6, borderRadius: 999, background: x.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, color: "var(--ui-text-muted)" }}>{x.label}</span>
                    <span style={{ color: "var(--ui-text-muted)" }}>{x.value}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* Map widget */}
            <section className={`${k.card} mount`}>
              <div className={s.head}>
                <h2 className={k.h2} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <MapPin style={{ width: 16, height: 16, color: "var(--ui-accent)" }} />
                  Helyszín
                </h2>
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
                    style={{ fontSize: 12, padding: "3px 10px", borderRadius: 5, background: "var(--ui-surface-muted)", border: "1px solid var(--ui-border-strong)", color: "var(--ui-accent)", cursor: geocoding ? "wait" : "pointer", display: "flex", alignItems: "center", gap: 4 }}
                  >
                    {geocoding && <Loader2 style={{ width: 11, height: 11, animation: "spin 1s linear infinite" }} />}
                    {geocoding ? "Geocodálás..." : company.lat ? "Újra" : "Geocodálás"}
                  </button>
                )}
              </div>
              <div>
                {company.lat && company.lng ? (
                  <iframe
                    src={`https://www.google.com/maps?q=${company.lat},${company.lng}&z=15&output=embed`}
                    style={{ width: "100%", height: 200, border: "none", display: "block" }}
                    loading="lazy"
                    title={`${company.name} térképen`}
                  />
                ) : (
                  <div className={`${k.muted} ${s.placeholder}`}>
                    {mapsConnected
                      ? "Kattints a Geocodálás gombra a cím meghatározásához."
                      : <span>Google Maps nincs csatlakoztatva. <a href="/settings" className={k.link}>Beállítások →</a></span>
                    }
                  </div>
                )}
                {geocodeMsg && (
                  <div style={{ padding: "6px 16px", fontSize: 12, color: geocodeMsg.includes("siker") ? "var(--ui-success-text)" : "var(--ui-danger-text)", borderTop: "1px solid var(--ui-border)" }}>
                    {geocodeMsg}
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      )}

      {/* Contacts */}
      {shownTab === "contacts" && (
        <div className={s.tabBody}>
          <section className={`${k.card} mount`}>
            <div className={s.head}>
              <h2 className={k.h2}>Kapcsolatok</h2>
              <button className={k.btn} onClick={() => setAddOpen(true)}>+ Hozzáadás</button>
            </div>
            <div className={k.tableWrap}>
              <table className={k.table}>
                <thead>
                  <tr>
                    <th>Személy</th><th>Beosztás</th><th>Email</th><th>Telefon</th><th>Státusz</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.length === 0 && (
                    <tr><td colSpan={6} style={{ textAlign: "center" }}><span className={k.muted}>Nincs kapcsolat.</span></td></tr>
                  )}
                  {contacts.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <Link href={`/persons/${c.personId}`} className={k.strong}>
                          {c.person.firstName} {c.person.lastName}
                        </Link>
                      </td>
                      <td>{c.role ?? "-"}</td>
                      <td className={k.num}>{c.email ?? c.person.email ?? "-"}</td>
                      <td className={k.num}>{c.phone ?? c.person.phone ?? "-"}</td>
                      <td>
                        {c.endedAt
                          ? <span className={k.muted}>Volt ({formatDate(c.endedAt)})</span>
                          : <Badge variant="success" label="Aktív" />
                        }
                      </td>
                      <td>
                        <div className={s.rowActions}>
                          {!c.endedAt && (
                            <>
                              <button className={k.btn} onClick={() => { setLogPerson(c); setLogOpen(true); }}>
                                <Phone style={{ width: 11, height: 11 }} /> Log
                              </button>
                              <button className={`${k.btn} ${k.btnIcon}`} aria-label="Kapcsolat lezárása" /* PROPOSAL copy */ onClick={() => handleCloseContact(c)}>
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
          </section>
        </div>
      )}

      {/* Activity */}
      {shownTab === "activity" && (
        <div className={s.tabBody}>
          <section className={`${k.card} mount`}>
            {interactions.length === 0 ? (
              <div className={k.muted} style={{ textAlign: "center", padding: "32px 0" }}>
                Nincs interakció. Naplózáshoz kattints a Contacts fülön.
              </div>
            ) : (
              <div className="tl">
                {interactions.map((r) => {
                  const accentColor = TYPE_COLOR[r.type ?? "note"] ?? "var(--ui-text-muted)";
                  return (
                    <div key={r.id} className="tl-item" style={{ "--accent": accentColor } as React.CSSProperties}>
                      <div className="tl-dot" />
                      <div className="tl-head">
                        <span className="who">
                          <span style={{ color: accentColor, fontWeight: 500 }}>
                            {TYPE_LABEL[r.type ?? ""] ?? r.type ?? "Ismeretlen"}
                          </span>
                          {r.direction && <span style={{ color: "var(--ui-text-muted)", margin: "0 6px" }}>·</span>}
                          {r.direction && <span style={{ color: "var(--ui-text-muted)" }}>{interactionDirectionLabel(r.direction)}</span>}
                          {r.person && (
                            <>
                              <span style={{ color: "var(--ui-text-muted)", margin: "0 6px" }}>·</span>
                              <Link href={`/persons/${r.person.id}`} className="row-link" style={{ color: "var(--ui-text-muted)" }}>
                                {r.person.firstName} {r.person.lastName}
                              </Link>
                            </>
                          )}
                        </span>
                        <span className="when">{formatDateTime(r.occurredAt)}</span>
                      </div>
                      {r.notes && <div className="tl-body">{r.notes}</div>}
                      {r.outcome && <div style={{ fontSize: 12, color: "var(--ui-text-muted)", marginTop: 4 }}>Eredmény: {r.outcome}</div>}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Tasks */}
      {shownTab === "tasks" && (
        <div className={s.tabBody}>
          <ContextTasksTab tasks={tasks} companyId={company.id} companyName={company.name} />
        </div>
      )}

      {/* NDT Profil */}
      {shownTab === "ndt" && (
        <div className={`${s.twoCol} ${s.tabBody}`}>
          {/* Left column: capabilities */}
          <div className={s.stack}>
            {company.ndtMethods.length > 0 && (
              <section className={`${k.card} mount`}>
                <h2 className={k.h2}>NDT módszerek</h2>
                <div className={s.chipsStart}>
                  {["VT","PT","MT","UT","RT","DRT","LT","HT","SPECTRO","consultation"].map((m) => {
                    const active = company.ndtMethods.includes(m);
                    return (
                      <div key={m} style={{ padding: "6px 12px", borderRadius: 6, fontSize: 14, fontWeight: 600,
                        background: active ? "var(--ui-surface-muted)" : "transparent",
                        color: active ? "var(--ui-text)" : "var(--ui-text-muted)",
                        border: `1px solid ${active ? "var(--ui-border)" : "transparent"}`,
                        opacity: active ? 1 : 0.3,
                      }}>
                        {m}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {company.productAreas.length > 0 && (
              <section className={`${k.card} mount`}>
                <h2 className={k.h2}>Termékterület</h2>
                <div className={s.chipsStart}>
                  {company.productAreas.map((pa) => (
                    <span key={pa} style={{ padding: "4px 10px", borderRadius: 5, fontSize: 14,
                      background: "var(--ui-surface-muted)", color: "var(--ui-text-muted)", border: "1px solid var(--ui-border)" }}>
                      {PRODUCT_AREA_LABEL[pa] ?? pa}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {company.materials.length > 0 && (
              <section className={`${k.card} mount`}>
                <h2 className={k.h2}>Vizsgált anyagok</h2>
                <div className={s.chipsStart}>
                  {company.materials.map((m) => (
                    <span key={m} style={{ padding: "4px 10px", borderRadius: 5, fontSize: 14,
                      background: "var(--ui-surface-muted)", color: "var(--ui-text-muted)" }}>
                      {MATERIAL_LABEL[m] ?? m}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {company.products.length > 0 && (
              <section className={`${k.card} mount`}>
                <h2 className={k.h2}>Gyártmányok</h2>
                <div className={s.chipsStart} style={{ gap: 6 }}>
                  {company.products.map((p, i) => (
                    <span key={i} style={{ padding: "3px 8px", borderRadius: 4, fontSize: 12,
                      background: "var(--ui-surface-muted)", color: "var(--ui-text-muted)" }}>
                      {p}
                    </span>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* Right column: inspection profile + addresses + competitors */}
          <div className={s.stack}>
            <section className={`${k.card} mount`}>
              <h2 className={k.h2}>Vizsgálati profil</h2>
              {company.inspectionFrequency && (
                <div className={k.kv}>
                  <span>Vizsgálati gyakoriság</span>
                  <span>{company.inspectionFrequency}</span>
                </div>
              )}
              {company.hasInternalLab !== null && (
                <div className={k.kv}>
                  <span>Labor típus</span>
                  <span>{company.hasInternalLab ? "Belső és külső labor" : "Csak külső labor"}</span>
                </div>
              )}
              {company.isPedCompliant !== null && (
                <div className={k.kv}>
                  <span>PED megfelelőség</span>
                  <span style={{ color: company.isPedCompliant ? "var(--ui-success-text)" : "var(--ui-text-muted)" }}>
                    {company.isPedCompliant ? "Igen" : "Nem"}
                  </span>
                </div>
              )}
            </section>

            {(company.competitor1 || company.competitor2 || company.competitor3) && (
              <section className={`${k.card} mount`}>
                <h2 className={k.h2}>Versenytársak</h2>
                <div className={s.list}>
                  {[company.competitor1, company.competitor2, company.competitor3].filter(Boolean).map((c, i) => (
                    <div key={i} style={{ fontSize: 14, padding: "5px 8px", background: "var(--ui-surface-muted)", borderRadius: 5, color: "var(--ui-danger-text)" }}>
                      {c}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {(company.siteCity || company.siteStreet) && (
              <section className={`${k.card} mount`}>
                <h2 className={k.h2}>Telephely</h2>
                <div className={k.kv}>
                  <span>Székhely</span>
                  <span>{[company.zipCode, company.city, company.address].filter(Boolean).join(", ") || "-"}</span>
                </div>
                {company.siteCity && (
                  <div className={k.kv}>
                    <span>Telephely</span>
                    <span>
                      {[company.siteZip, company.siteCity, company.siteStreet].filter(Boolean).join(", ")}
                      {company.siteCounty && (
                        <span className={k.muted} style={{ display: "block" }}>{company.siteCounty}</span>
                      )}
                    </span>
                  </div>
                )}
              </section>
            )}
          </div>
        </div>
      )}

      {/* App Events */}
      {shownTab === "events" && (
        <div className={s.tabBody}>
          <section className={`${k.card} mount`}>
            <div className="tl">
              {appEvents.map((ev) => (
                <div key={ev.id} className="tl-item" style={{ "--accent": "var(--ui-text-muted)" } as React.CSSProperties}>
                  <div className="tl-dot" />
                  <div className="tl-head">
                    <span className="who">
                      <span style={{ color: "var(--ui-text-muted)", fontWeight: 500 }}>{ev.eventType}</span>
                      <span style={{ color: "var(--ui-text-muted)", margin: "0 6px" }}>·</span>
                      <span style={{ color: "var(--ui-text-muted)" }}>{ev.sourceApp}</span>
                      {ev.agent && (
                        <>
                          <span style={{ color: "var(--ui-text-muted)", margin: "0 6px" }}>via</span>
                          <span style={{ color: "var(--ui-text)" }}>{ev.agent.name}</span>
                        </>
                      )}
                    </span>
                    <span className="when">{formatDateTime(ev.createdAt)}</span>
                  </div>
                  <div className="tl-body" style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ui-text-muted)" }}>
                    {JSON.stringify(ev.payload, null, 0).slice(0, 120)}
                    {JSON.stringify(ev.payload).length > 120 ? "…" : ""}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* Metadata (effective-dated attributes) */}
      {shownTab === "metadata" && (
        <div className={s.tabBody}>
          <CompanyMetadataTab companyId={company.id} attributes={attributes} />
        </div>
      )}

      {/* Dossier — closeness score + research notes from the enrichment agent */}
      {shownTab === "dossier" && (
        <div className={s.tabBody}>
          <DossierTab
            enrichment={company.enrichment}
            closenessScore={company.closenessScore ?? null}
            enrichmentUpdatedAt={company.enrichmentUpdatedAt ?? null}
            emptyText="Ehhez a céghez még nincs dosszié."
          />
        </div>
      )}

      {/* History */}
      {shownTab === "history" && (
        <div className={s.tabBody}>
          <section className={`${k.card} mount`}>
            <AuditLogEntries entries={auditEntries} />
          </section>
        </div>
      )}
      </div>
    </>
  );
}
