"use client";

import { useDeferredValue, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { triggerBulkEnrichment, getProposalsByRun } from "@/app/actions/enrichment";
import { EnrichmentDrawer } from "@/components/EnrichmentDrawer";
import Link from "next/link";
import { Sparkline } from "@/components/viz/Sparkline";
import { SignalMeter } from "@/components/viz/SignalMeter";
import { LogInteractionButton } from "@/components/LogInteractionButton";
import { SendEmailButton } from "@/components/SendEmailButton";
import { TagInput } from "@/components/tags/TagInput";
import { ContextTasksTab } from "@/components/ContextTasksTab";
import { AuditLogEntries } from "@/components/AuditLogTab";
import { TaskModal } from "@/app/(app)/tasks/TaskModal";
import { SetEmployerModal } from "./SetEmployerModal";
import { DossierTab } from "@/components/DossierTab";
import { formatDate, formatDateTime } from "@/lib/utils";
import { interactionDirectionLabel } from "@/lib/interactions";
import { Loader2, Trash2 } from "lucide-react";
import { updatePerson, deletePerson, restorePerson } from "@/app/actions/persons";
import { personLeftCompany } from "@/app/actions/contacts";
import { employerState } from "@/lib/persons/employer";
import { PageHeader } from "@/components/astryx/PageHeader";
import { Badge } from "@astryxdesign/core/Badge";
import k from "@/components/astryx/page.module.css";
import s from "../persons.module.css";

interface Contact {
  id: number; companyId: number; role: string | null;
  startedAt: string | Date | null; endedAt: string | Date | null;
  company: { id: number; name: string; vatNumber: string | null; city: string | null; pipelineStatus: string | null };
}
interface Interaction {
  id: number; type: string | null; direction: string | null;
  notes: string | null; outcome: string | null; occurredAt: string | Date;
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
interface ConversationMessage {
  id: number; role: string; content: string; createdAt: string | Date;
}
interface Conversation {
  id: number; channel: string; summary: string | null;
  startedAt: string | Date; endedAt: string | Date | null;
  agent: { id: number; name: string; role: string; owner: string | null } | null;
  messages: ConversationMessage[];
}
interface Person {
  id: number; firstName: string | null; lastName: string | null;
  email: string | null; phone: string | null; notes: string | null;
  deletedAt?: string | Date | null;
  enrichment?: unknown; closenessScore?: number | null; enrichmentUpdatedAt?: string | Date | null;
}

const TYPE_COLOR: Record<string, string> = {
  call: "var(--ui-text-muted)", email: "var(--ui-text-muted)", meeting: "var(--ui-text-muted)",
  site_visit: "var(--ui-text-muted)", note: "var(--ui-text-muted)",
};
const TYPE_LABEL: Record<string, string> = {
  call: "Hívás", email: "Email", meeting: "Találkozó",
  site_visit: "Helyszíni", note: "Megjegyzés",
};

interface Props {
  person: Person;
  contacts: Contact[];
  interactions: Interaction[];
  tasks: Task[];
  conversations: Conversation[];
  engagementSeries: number[];
  signalLevel: number;
  initials: string;
  initialTags: { id: number; name: string; color: string }[];
  auditEntries: Parameters<typeof AuditLogEntries>[0]["entries"];
}

export function PersonDetailClient({
  person, contacts, interactions, tasks, conversations,
  engagementSeries, signalLevel, initials, initialTags, auditEntries,
}: Props) {
  const router = useRouter();
  const [tab, setTab] = useState("activity");
  // Same split as CompanyDetailClient: pills read `tab`, bodies read `shownTab`.
  const shownTab = useDeferredValue(tab);
  const switching = tab !== shownTab;
  const [taskOpen, setTaskOpen] = useState(false);
  const [employerOpen, setEmployerOpen] = useState(false);
  const [deleting, startDelete] = useTransition();
  const [form, setForm] = useState({
    firstName:   person.firstName   ?? "",
    lastName:    person.lastName    ?? "",
    email:       person.email       ?? "",
    phone:       person.phone       ?? "",
    linkedinUrl: "" as string,
    notes:       person.notes       ?? "",
  });
  const [saving, startSave] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [restoring, startRestore] = useTransition();
  const isDeleted = !!person.deletedAt;
  const [enriching, startEnrich] = useTransition();
  const [leaving, startLeave] = useTransition();
  const [enrichmentProposals, setEnrichmentProposals] = useState<Awaited<ReturnType<typeof getProposalsByRun>> | null>(null);

  function handleDelete() {
    const name = `${person.lastName ?? ""} ${person.firstName ?? ""}`.trim();
    if (!confirm(`Biztosan törölni szeretnéd ${name} személyt?\nEz a művelet nem vonható vissza.`)) return;
    startDelete(async () => {
      await deletePerson(person.id);
      router.push("/persons");
    });
  }

  function handleEnrich() {
    startEnrich(async () => {
      const runId = await triggerBulkEnrichment("person", [person.id]);
      const proposals = await getProposalsByRun(runId);
      setEnrichmentProposals(proposals);
    });
  }

  const currentContact = contacts.find((c) => !c.endedAt);

  const [leaveError, setLeaveError] = useState<string | null>(null);

  function handleLeftConfirm() {
    if (!currentContact) return;
    if (!confirm(`Biztosan kilépett innen: ${currentContact.company.name}? A munkahely ezután ismeretlen lesz, az előzmények megmaradnak.`)) return;
    setLeaveError(null);
    startLeave(async () => {
      // The action is auth-gated, so it can come back denied. Refreshing on a
      // rejection would redraw the unchanged employment and read as a no-op
      // that the user cannot explain.
      const res = await personLeftCompany(currentContact.id, currentContact.companyId, person.id);
      if (res && "error" in res && res.error) { setLeaveError(res.error); return; }
      router.refresh();
    });
  }
  const signalLabel = signalLevel >= 5 ? "Aktív: 7 napon belül érintkezés"
    : signalLevel >= 3 ? "Stabil: negyedéves kapcsolattartás"
    : "Hideg: 90+ nap inaktivitás";

  const TABS = [
    { key: "activity",      label: "Interakciók",  count: interactions.length },
    { key: "career",        label: "Karrierút",    count: contacts.length },
    { key: "tasks",         label: "Feladatok",    count: tasks.filter(t => t.status !== "done").length },
    ...(conversations.length > 0
      ? [{ key: "conversations", label: "AI Beszélgetések", count: conversations.length }]
      : []),
    { key: "adatok",        label: "Adatok",       count: 0 },
    { key: "dossier",       label: "Dosszié",      count: 0 },
  ];

  return (
    <>
      <TaskModal
        open={taskOpen}
        onClose={() => { setTaskOpen(false); router.refresh(); }}
        initial={{ personId: person.id, companyId: currentContact?.companyId, personName: `${person.lastName ?? ""} ${person.firstName ?? ""}`.trim() }}
      />
      <SetEmployerModal
        open={employerOpen}
        onClose={() => setEmployerOpen(false)}
        personId={person.id}
        currentCompanyName={currentContact?.company.name}
      />
      {enrichmentProposals && (
        <EnrichmentDrawer
          proposals={enrichmentProposals as unknown as Parameters<typeof EnrichmentDrawer>[0]["proposals"]}
          onClose={() => { setEnrichmentProposals(null); router.refresh(); }}
        />
      )}

      {isDeleted && (
        <div
          style={{
            display: "flex", alignItems: "center", gap: 12, marginBottom: 14,
            padding: "10px 16px", borderRadius: "var(--ui-radius-surface)",
            background: "var(--ui-danger-surface)", border: "1px solid var(--ui-danger)",
          }}
        >
          <span style={{ fontSize: 14, color: "var(--ui-text)", flex: 1 }}>
            Ez a személy törölve van: nem jelenik meg a keresésben, és az adatai nem
            menthetők, amíg vissza nem állítod.
          </span>
          <button
            className={`${k.btn} ${k.btnPrimary}`}
            disabled={restoring}
            onClick={() => startRestore(async () => { await restorePerson(person.id); router.refresh(); })}
          >
            {restoring ? "Visszaállítás..." : "Visszaállítás"}
          </button>
        </div>
      )}

      <PageHeader
        title={<>{person.lastName} {person.firstName}</>}
        eyebrow={currentContact ? (
          <>
            {currentContact.role && <span>{currentContact.role} </span>}
            <span>at</span>{" "}
            <Link href={`/companies/${currentContact.companyId}`} className={k.link}>
              {currentContact.company.name}
            </Link>
          </>
        ) : undefined}
        actions={
          <>
            <LogInteractionButton
              personId={person.id}
              companyId={currentContact?.companyId}
              personName={`${person.lastName ?? ""} ${person.firstName ?? ""}`.trim()}
              companyName={currentContact?.company.name}
            />
            <SendEmailButton
              personId={person.id}
              companyId={currentContact?.companyId}
              defaultTo={person.email || undefined}
              contextLabel={`${person.lastName ?? ""} ${person.firstName ?? ""}`.trim()}
            />
            <button className={k.btn} onClick={() => setTaskOpen(true)}>+ Feladat</button>
            <button
              className={k.btn}
              onClick={handleEnrich}
              disabled={enriching}
            >
              <Loader2 size={14} aria-hidden="true" style={{ animation: enriching ? "spin 1.2s linear infinite" : "none" }} />
              {enriching ? "Elemzés folyamatban..." : "Adatfrissítés"}
            </button>
            <button
              className={`${k.btn} ${k.btnIcon}`}
              style={{ color: "var(--ui-danger-text)" }}
              onClick={handleDelete}
              disabled={deleting}
              title="Személy törlése"
              aria-label="Személy törlése"
            >
              <Trash2 style={{ width: 14, height: 14 }} />
            </button>
          </>
        }
      />

      <div className={k.split}>
        {/* Left: engagement, tabs and tab content. While the deferred body is still rendering the new
            pill is lit but the OLD body is on screen — `inert` stops a click or
            a Tab key landing on the tab the user left. No dimming: the urgent
            pass fires on every switch, so it would flash. (Vanda, PR #83.) */}
        <div>
          <div className={k.card} style={{ marginBottom: 16 }}>
            <span className={k.statK}>Aktivitás · elmúlt 24 hét</span>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 24 }}>
              <div className={k.stat}>
                <span className={k.statV}>{interactions.length}</span>
                <span className={k.statK}>interakció</span>
              </div>
              <div className={k.stat}>
                <span className={k.statV}>{tasks.filter(t => t.status !== "done").length}</span>
                <span className={k.statK}>nyitott feladat</span>
              </div>
              <div className={k.stat}>
                <span className={k.statV}>{contacts.length}</span>
                <span className={k.statK}>munkahely</span>
              </div>
              <div style={{ flex: "1 1 200px", minWidth: 0, maxWidth: "100%", overflow: "hidden" }}>
                <Sparkline data={engagementSeries} width={240} height={48} color="var(--ui-accent)" />
              </div>
            </div>
          </div>

          <div className={k.seg} aria-busy={switching}>
            {TABS.map(({ key, label, count }) => (
              <button
                key={key}
                type="button"
                className={`${k.segItem} ${tab === key ? k.segItemOn : ""}`}
                onClick={() => setTab(key)}
              >
                {label}
                <span className={k.num} style={{ marginLeft: 6 }}>{count}</span>
              </button>
            ))}
          </div>

          {/* Quick action strip — always visible below tabs */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "16px 0" }}>
            <LogInteractionButton
              personId={person.id}
              companyId={currentContact?.companyId}
              personName={`${person.lastName ?? ""} ${person.firstName ?? ""}`.trim()}
              companyName={currentContact?.company.name}
            />
            <button className={k.btn} onClick={() => setTaskOpen(true)}>+ Feladat</button>
          </div>

          <div inert={switching}>
            {/* Activity */}
            {shownTab === "activity" && (
              <div className={k.card}>
                {interactions.length === 0 ? (
                  <div className={k.empty}>Nincs interakció rögzítve.</div>
                ) : (
                  <div className={k.list}>
                    {interactions.map((r) => {
                      const accent = TYPE_COLOR[r.type ?? "note"] ?? "var(--ui-text-muted)";
                      return (
                        <div key={r.id} className={k.rowCompact}>
                          <span className={k.bar} style={{ background: accent }} />
                          <div className={k.cell}>
                            <span className={k.nameLine}>
                              <span style={{ color: accent, fontWeight: 500 }}>
                                {TYPE_LABEL[r.type ?? ""] ?? r.type ?? "Ismeretlen"}
                              </span>
                              {r.direction && (
                                <span className={k.muted}>· {interactionDirectionLabel(r.direction)}</span>
                              )}
                              <span className={`${k.muted} ${k.num}`}>{formatDateTime(r.occurredAt)}</span>
                            </span>
                            {(r.notes || r.outcome) && (
                              <p className={s.note}>
                                {r.notes}
                                {r.notes && r.outcome && <br />}
                                {r.outcome && <span className={k.muted}>Eredmény: {r.outcome}</span>}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Career */}
            {shownTab === "career" && (
              <div className={k.card}>
                <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                  <h2 className={k.h2}>Karrierút</h2>
                  <span className={`${k.muted} ${k.num}`}>
                    {contacts.length} munkahely
                  </span>
                  <button className={k.btn} style={{ marginLeft: "auto" }} onClick={() => setEmployerOpen(true)}>
                    + Munkahelyváltás
                  </button>
                  {currentContact && (
                    <button className={k.btn} disabled={leaving} onClick={handleLeftConfirm}>
                      Kilépett
                    </button>
                  )}
                </div>
                {leaveError && (
                  <p className={k.error} style={{ margin: 0 }}>{leaveError}</p>
                )}
                {employerState(contacts).kind === "unknown" && (
                  <span className={k.muted}>
                    Jelenlegi munkahely ismeretlen.
                  </span>
                )}
                <div className={k.list}>
                  {contacts.map((c) => (
                    <div key={c.id} className={k.row}>
                      <span className={k.bar} style={{ background: c.endedAt ? "var(--ui-border-strong)" : "var(--ui-accent)" }} />
                      <div className={k.cell}>
                        <span className={k.nameLine}>
                          <span className={k.strong}>{c.role ?? "Munkatárs"}</span>
                          <span className={k.muted}>at</span>
                          <Link href={`/companies/${c.companyId}`} className={k.link}>{c.company.name}</Link>
                          {!c.endedAt && <Badge variant="blue" label="current" />}
                        </span>
                      </div>
                      <div className={k.cell}>
                        <span className={k.muted}>{c.company.city}{c.company.city ? " · " : ""}{c.company.vatNumber ?? ""}</span>
                      </div>
                      <span className={`${k.muted} ${k.num}`}>
                        {c.startedAt ? formatDate(c.startedAt) : "?"} → {c.endedAt ? formatDate(c.endedAt) : "jelenleg"}
                      </span>
                    </div>
                  ))}
                </div>
                <div className={k.cardMuted}>
                  <div className={k.strong} style={{ marginBottom: 4 }}>Miért tároljuk a karriertörténetet</div>
                  <span className={k.muted}>
                    Ha a személy céget vált, a teljes kapcsolati történet követi. A kapcsolat az érték: nem az adott munkáltatónál lévő rekord.
                  </span>
                </div>
              </div>
            )}

            {/* Tasks */}
            {shownTab === "tasks" && (
              <div>
                <ContextTasksTab
                  tasks={tasks}
                  personId={person.id}
                  personName={`${person.lastName ?? ""} ${person.firstName ?? ""}`.trim()}
                  companyId={currentContact?.companyId}
                  companyName={currentContact?.company.name}
                />
              </div>
            )}

            {/* Conversations */}
            {shownTab === "conversations" && (
              <div className={k.card}>
                {conversations.map((conv) => (
                  <div key={conv.id} className={k.section}>
                    <div className={k.nameLine}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--ui-text-muted)", flexShrink: 0 }} />
                      <span className={k.strong}>
                        {conv.summary ?? conv.channel}
                      </span>
                      {conv.agent && (
                        <Badge variant="neutral" label={`${conv.agent.name} · ${conv.agent.owner ?? conv.agent.role}`} />
                      )}
                      <span className={`${k.muted} ${k.num}`} style={{ marginLeft: "auto" }}>
                        {formatDateTime(conv.startedAt)}
                      </span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {conv.messages.map((msg) => (
                        <div
                          key={msg.id}
                          style={{
                            padding: "8px 12px",
                            borderRadius: "var(--ui-radius-control)",
                            fontSize: 14,
                            lineHeight: 1.5,
                            background: msg.role === "user" ? "var(--ui-surface-muted)" : "var(--ui-accent-surface)",
                            color: msg.role === "user" ? "var(--ui-text-muted)" : "var(--ui-text)",
                            marginLeft: msg.role === "user" ? 0 : 16,
                            border: "1px solid var(--ui-border)",
                          }}
                        >
                          <span className={k.muted} style={{ display: "block", fontSize: 12, marginBottom: 4 }}>
                            {msg.role}
                          </span>
                          {msg.content}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Adatok — inline edit */}
            {shownTab === "adatok" && (
              <div className={k.card}>
                {(
                  [
                    { key: "lastName",   label: "Vezetéknév",  type: "text"  },
                    { key: "firstName",  label: "Keresztnév",  type: "text"  },
                    { key: "email",      label: "Email",       type: "email" },
                    { key: "phone",      label: "Telefon",     type: "tel"   },
                    { key: "linkedinUrl", label: "LinkedIn URL", type: "url" },
                  ] as { key: keyof typeof form; label: string; type: string }[]
                ).map(({ key, label, type }) => (
                  <div key={key}>
                    <div className={k.muted}>{label}</div>
                    <input
                      type={type}
                      value={form[key]}
                      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                      style={{
                        width: "100%", fontSize: 14, padding: "8px 10px", boxSizing: "border-box",
                        background: "var(--ui-surface)", border: "1px solid var(--ui-border)",
                        borderRadius: "var(--ui-radius-control)", color: "var(--ui-text)",
                      }}
                    />
                  </div>
                ))}
                <div>
                  <div className={k.muted}>Megjegyzés</div>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    rows={4}
                    style={{
                      width: "100%", fontSize: 14, padding: "8px 10px", boxSizing: "border-box",
                      background: "var(--ui-surface)", border: "1px solid var(--ui-border)",
                      borderRadius: "var(--ui-radius-control)", color: "var(--ui-text)", resize: "vertical",
                    }}
                  />
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  <button
                    className={`${k.btn} ${k.btnPrimary}`}
                    disabled={saving}
                    onClick={() => {
                      startSave(async () => {
                        setSaveError(null);
                        const res = await updatePerson(person.id, {
                          firstName:   form.firstName   || undefined,
                          lastName:    form.lastName    || undefined,
                          email:       form.email       || undefined,
                          phone:       form.phone       || undefined,
                          linkedinUrl: form.linkedinUrl || undefined,
                          notes:       form.notes       || undefined,
                        });
                        if (res?.error) { setSaveError(res.error); return; }
                        router.refresh();
                      });
                    }}
                  >
                    {saving ? "Mentés..." : "Mentés"}
                  </button>
                  <button
                    className={k.btn}
                    onClick={() => setForm({
                      firstName:   person.firstName   ?? "",
                      lastName:    person.lastName    ?? "",
                      email:       person.email       ?? "",
                      phone:       person.phone       ?? "",
                      linkedinUrl: "",
                      notes:       person.notes       ?? "",
                    })}
                  >
                    Mégse
                  </button>
                </div>
                {saveError && (
                  <p className={k.error} style={{ margin: 0 }}>{saveError}</p>
                )}
              </div>
            )}

            {/* Dossier — closeness score + research notes from the enrichment agent */}
            {shownTab === "dossier" && (
              <DossierTab
                enrichment={person.enrichment}
                closenessScore={person.closenessScore ?? null}
                enrichmentUpdatedAt={person.enrichmentUpdatedAt ?? null}
                emptyText="Ehhez a személyhez még nincs dosszié."
              />
            )}
          </div>
        </div>

        {/* Right: sidebar panels */}
        <div className={k.asideFirst} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Summary: contact facts, signal, tags */}
          <div className={k.card}>
            <div style={{
              width: 48, height: 48, borderRadius: "50%",
              background: "var(--ui-surface-muted)", display: "grid", placeItems: "center",
              fontWeight: 600, fontSize: 16, color: "var(--ui-text-muted)",
            }}>
              {initials}
            </div>
            {person.email && (
              <div className={k.kv}>
                <span>Email</span>
                <a href={`mailto:${person.email}`} className={k.link}>{person.email}</a>
              </div>
            )}
            {person.phone && (
              <div className={k.kv}>
                <span>Telefon</span>
                <a href={`tel:${person.phone}`} className={k.link}>{person.phone}</a>
              </div>
            )}
            {currentContact?.company.city && (
              <div className={k.kv}>
                <span>Város</span> {/* PROPOSAL copy */}
                <span>{currentContact.company.city}</span>
              </div>
            )}
            <div className={k.kv}>
              <span>Relationship signal</span>
              <span className={k.num}>{signalLevel}.0 <span className={k.muted}>/ 6.0</span></span>
            </div>
            <SignalMeter level={signalLevel} />
            <span className={k.muted}>{signalLabel}</span>
            <div style={{ marginTop: 8 }}>
              <TagInput taggableType="person" taggableId={person.id} initialTags={initialTags} />
            </div>
          </div>

          {/* Current employer */}
          {!currentContact && (
            <div className={k.card}>
              <h2 className={k.h2}>Jelenlegi munkahely</h2>
              <span className={k.muted}>Nincs rögzített munkahely.</span>
              <div>
                <button className={`${k.btn} ${k.btnPrimary}`} onClick={() => setEmployerOpen(true)}>
                  + Munkahely beállítása
                </button>
              </div>
            </div>
          )}
          {currentContact && (
            <div className={k.card}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <h2 className={k.h2}>Jelenlegi munkahely</h2>
                <button className={k.btn} onClick={() => setEmployerOpen(true)}>
                  Módosítás
                </button>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 42, height: 42, borderRadius: "var(--ui-radius-control)",
                  background: "var(--ui-surface-muted)", display: "grid", placeItems: "center",
                  fontWeight: 600, fontSize: 14, color: "var(--ui-text-link)", flexShrink: 0,
                }}>
                  {currentContact.company.name.slice(0, 2).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Link href={`/companies/${currentContact.companyId}`} className={k.link}>
                    {currentContact.company.name}
                  </Link>
                  {currentContact.company.city && (
                    <div className={k.muted}>
                      {currentContact.company.city}
                    </div>
                  )}
                </div>
              </div>
              {currentContact.company.vatNumber && (
                <div className={k.kv}>
                  <span>VAT</span>
                  <span className={k.num}>{currentContact.company.vatNumber}</span>
                </div>
              )}
              {currentContact.role && (
                <div className={k.kv}>
                  <span>Beosztás</span>
                  <span>{currentContact.role}</span>
                </div>
              )}
              <div className={k.kv}>
                <span>Munkaviszony kezdete</span>
                <span className={k.num}>{currentContact.startedAt ? formatDate(currentContact.startedAt) : "Ismeretlen"}</span>
              </div>
            </div>
          )}

          {/* Audit */}
          <div className={k.card}>
            <h2 className={k.h2}>History</h2>
            <div style={{ maxHeight: 300, overflowY: "auto" }}>
              <AuditLogEntries entries={auditEntries} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
