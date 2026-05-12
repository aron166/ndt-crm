"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AreaChart } from "@/components/viz/AreaChart";
import { StackBar } from "@/components/viz/StackBar";
import { LogInteractionModal } from "@/components/LogInteractionModal";
import { AddContactModal } from "./AddContactModal";
import { closeContact } from "@/app/actions/contacts";
import { TagInput } from "@/components/tags/TagInput";
import { AuditLogEntries } from "@/components/AuditLogTab";
import { ContextTasksTab } from "@/components/ContextTasksTab";
import { formatDate, formatDateTime } from "@/lib/utils";
import { interactionTypeLabel, interactionDirectionLabel } from "@/lib/interactions";
import { Phone, X } from "lucide-react";

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
  parentTaskId: number | null; _count: { subTasks: number };
}

interface AppEvent {
  id: number; sourceApp: string; eventType: string;
  payload: unknown; createdAt: string | Date;
  agent: { id: number; name: string; owner: string | null } | null;
}

interface Props {
  company: { id: number; name: string; vatNumber: string | null; city: string | null; county: string | null; website: string | null; pipelineStatus: string | null; lastInteractionDate: string | Date | null; createdAt: Date };
  contacts: Contact[];
  interactions: Interaction[];
  tasks: Task[];
  appEvents: AppEvent[];
  revenueSeries: number[];
  engagementBreakdown: { label: string; value: number; color: string }[];
  kpis: { label: string; value: string | number; accent: string }[];
  avatarColor: string;
  initials: string;
  initialTags: { id: number; name: string; color: string }[];
  auditEntries: Parameters<typeof AuditLogEntries>[0]["entries"];
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
  company, contacts, interactions, tasks, appEvents, revenueSeries,
  engagementBreakdown, kpis, avatarColor, initials, initialTags, auditEntries,
}: Props) {
  const router = useRouter();
  const [tab, setTab] = useState("overview");
  const [logOpen, setLogOpen] = useState(false);
  const [logPerson, setLogPerson] = useState<Contact | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  async function handleCloseContact(contact: Contact) {
    if (!confirm(`Lezárod ${contact.person.firstName} ${contact.person.lastName} kapcsolatát?`)) return;
    await closeContact(contact.id, company.id, contact.personId);
    router.refresh();
  }

  const TABS = [
    { key: "overview",   label: "Áttekintés" },
    { key: "contacts",   label: `Contacts · ${contacts.filter(c => !c.endedAt).length}` },
    { key: "activity",   label: `Activity · ${interactions.length}` },
    { key: "tasks",      label: `Tasks · ${tasks.filter(t => t.status !== "done").length}` },
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
            <div style={{ marginTop: 6, color: "var(--fg-soft)", fontSize: 13 }}>
              {[company.city, company.county].filter(Boolean).join(" · ")}
              {company.vatNumber && (
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--fg-faint)", marginLeft: 12 }}>
                  {company.vatNumber}
                </span>
              )}
            </div>
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
            <button className="btn" onClick={() => setAddOpen(true)}>+ Új kapcsolat</button>
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
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginTop: 16 }}>
          <div className="panel mount">
            <div className="panel-head">
              <div className="panel-title">Forgalom · 24 hónap</div>
            </div>
            <div style={{ padding: 18 }}>
              {revenueSeries.length >= 2 ? (
                <AreaChart data={revenueSeries} height={180} color="var(--indigo)" />
              ) : (
                <div style={{ height: 180, display: "grid", placeItems: "center", color: "var(--fg-faint)", fontSize: 13 }}>
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
            <div className="panel-head"><div className="panel-title">Interakció típusok</div></div>
            <div className="panel-pad">
              <StackBar segments={engagementBreakdown} />
              <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                {engagementBreakdown.map((x, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                    <span style={{ width: 6, height: 6, borderRadius: 999, background: x.color, boxShadow: `0 0 6px ${x.color}`, flexShrink: 0 }} />
                    <span style={{ flex: 1, color: "var(--fg-soft)" }}>{x.label}</span>
                    <span style={{ fontFamily: "var(--font-mono)", color: "var(--fg-mute)" }}>{x.value}</span>
                  </div>
                ))}
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
                      ? <span style={{ fontSize: 11, color: "var(--fg-faint)" }}>Volt ({formatDate(c.endedAt)})</span>
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
            <div style={{ textAlign: "center", color: "var(--fg-mute)", padding: "32px 0", fontSize: 13 }}>
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
                    {r.outcome && <div style={{ fontSize: 11, color: "var(--fg-faint)", marginTop: 4 }}>Eredmény: {r.outcome}</div>}
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
                <div className="tl-body" style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-faint)" }}>
                  {JSON.stringify(ev.payload, null, 0).slice(0, 120)}
                  {JSON.stringify(ev.payload).length > 120 ? "…" : ""}
                </div>
              </div>
            ))}
          </div>
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
