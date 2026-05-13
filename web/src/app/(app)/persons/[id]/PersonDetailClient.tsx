"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { triggerBulkEnrichment, getProposalsByRun } from "@/app/actions/enrichment";
import { EnrichmentDrawer } from "@/components/EnrichmentDrawer";
import Link from "next/link";
import { Sparkline } from "@/components/viz/Sparkline";
import { SignalMeter } from "@/components/viz/SignalMeter";
import { LogInteractionButton } from "@/components/LogInteractionButton";
import { TagInput } from "@/components/tags/TagInput";
import { ContextTasksTab } from "@/components/ContextTasksTab";
import { AuditLogEntries } from "@/components/AuditLogTab";
import { TaskModal } from "@/app/(app)/tasks/TaskModal";
import { formatDate, formatDateTime } from "@/lib/utils";
import { interactionTypeLabel, interactionDirectionLabel } from "@/lib/interactions";
import { Mail, Phone, MapPin, ExternalLink } from "lucide-react";

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
  parentTaskId: number | null; _count: { subTasks: number };
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
}

const TYPE_COLOR: Record<string, string> = {
  call: "var(--mint)", email: "var(--sky)", meeting: "var(--violet)",
  site_visit: "var(--amber)", note: "var(--fg-mute)",
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
  avatarColor: string;
  initials: string;
  initialTags: { id: number; name: string; color: string }[];
  auditEntries: Parameters<typeof AuditLogEntries>[0]["entries"];
}

export function PersonDetailClient({
  person, contacts, interactions, tasks, conversations,
  engagementSeries, signalLevel, avatarColor, initials, initialTags, auditEntries,
}: Props) {
  const router = useRouter();
  const [tab, setTab] = useState("activity");
  const [taskOpen, setTaskOpen] = useState(false);
  const [enriching, startEnrich] = useTransition();
  const [enrichmentProposals, setEnrichmentProposals] = useState<Awaited<ReturnType<typeof getProposalsByRun>> | null>(null);

  function handleEnrich() {
    startEnrich(async () => {
      const runId = await triggerBulkEnrichment("person", [person.id]);
      const proposals = await getProposalsByRun(runId);
      setEnrichmentProposals(proposals);
    });
  }

  const currentContact = contacts.find((c) => !c.endedAt);
  const signalLabel = signalLevel >= 5 ? "Aktív — 7 napon belül érintkezés"
    : signalLevel >= 3 ? "Stabil — negyedéves kapcsolattartás"
    : "Hideg — 90+ nap inaktivitás";

  const TABS = [
    { key: "activity",      label: "Interakciók",  count: interactions.length },
    { key: "career",        label: "Karrierút",    count: contacts.length },
    { key: "tasks",         label: "Feladatok",    count: tasks.filter(t => t.status !== "done").length },
    ...(conversations.length > 0
      ? [{ key: "conversations", label: "AI Beszélgetések", count: conversations.length }]
      : []),
  ];

  return (
    <>
      <TaskModal
        open={taskOpen}
        onClose={() => { setTaskOpen(false); router.refresh(); }}
        initial={{ personId: person.id, companyId: currentContact?.companyId, personName: `${person.lastName ?? ""} ${person.firstName ?? ""}`.trim() }}
      />
      {enrichmentProposals && (
        <EnrichmentDrawer
          proposals={enrichmentProposals as unknown as Parameters<typeof EnrichmentDrawer>[0]["proposals"]}
          onClose={() => { setEnrichmentProposals(null); router.refresh(); }}
        />
      )}

      {/* Detail header */}
      <div className="detail-header mount">
        <div style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>
          {/* Avatar */}
          <div style={{
            width: 72, height: 72, borderRadius: "50%",
            background: avatarColor, display: "grid", placeItems: "center",
            fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: 22, color: "white",
            flexShrink: 0, position: "relative",
          }}>
            {initials}
            {/* online dot */}
            <div style={{
              position: "absolute", right: 0, bottom: 0,
              width: 14, height: 14, borderRadius: "50%",
              background: "var(--mint)", border: "2px solid var(--bg-page)",
              boxShadow: "0 0 8px var(--mint)",
            }} />
          </div>

          {/* Name + info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--fg)" }}>
              {person.lastName} {person.firstName}
            </h1>
            {currentContact && (
              <div style={{ marginTop: 6, color: "var(--fg-soft)", fontSize: 14 }}>
                {currentContact.role && <span>{currentContact.role} </span>}
                <span style={{ color: "var(--fg-faint)" }}>at</span>{" "}
                <Link href={`/companies/${currentContact.companyId}`} className="row-link">
                  {currentContact.company.name}
                </Link>
              </div>
            )}
            <div style={{ display: "flex", gap: 16, marginTop: 12, flexWrap: "wrap" }}>
              {person.email && (
                <a href={`mailto:${person.email}`} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--fg-soft)" }} className="row-link">
                  <Mail style={{ width: 13, height: 13 }} />
                  <span style={{ fontFamily: "var(--font-mono)" }}>{person.email}</span>
                </a>
              )}
              {person.phone && (
                <a href={`tel:${person.phone}`} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--fg-soft)" }} className="row-link">
                  <Phone style={{ width: 13, height: 13 }} />
                  <span style={{ fontFamily: "var(--font-mono)" }}>{person.phone}</span>
                </a>
              )}
              {currentContact?.company.city && (
                <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--fg-soft)" }}>
                  <MapPin style={{ width: 13, height: 13 }} /> {currentContact.company.city}
                </span>
              )}
            </div>
          </div>

          {/* Signal strength panel */}
          <div style={{
            minWidth: 180, background: "var(--bg-1)",
            border: "1px solid var(--line-soft)", borderRadius: 8, padding: 14, flexShrink: 0,
          }}>
            <div className="field-label">Relationship signal</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 4 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 500 }}>{signalLevel}.0</span>
              <span style={{ fontSize: 11, color: "var(--fg-mute)" }}>/ 6.0</span>
            </div>
            <SignalMeter level={signalLevel} />
            <div style={{ fontSize: 11, color: "var(--fg-mute)", marginTop: 8, lineHeight: 1.4 }}>
              {signalLabel}
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
            <LogInteractionButton
              personId={person.id}
              companyId={currentContact?.companyId}
              personName={`${person.lastName ?? ""} ${person.firstName ?? ""}`.trim()}
              companyName={currentContact?.company.name}
            />
            <button className="btn" onClick={() => setTaskOpen(true)}>+ Feladat</button>
            <button
              className="btn"
              onClick={handleEnrich}
              disabled={enriching}
              style={{ display: "flex", alignItems: "center", gap: 6 }}
            >
              <span style={{ display: "inline-block", animation: enriching ? "spin 1.2s linear infinite" : "none", fontSize: 13 }}>✦</span>
              {enriching ? "Elemzés folyamatban..." : "Adatfrissítés"}
            </button>
          </div>
        </div>

        {/* Engagement strip */}
        <div style={{
          marginTop: 18, padding: 14,
          background: "var(--bg-0)", borderRadius: 8, border: "1px solid var(--line-soft)",
          display: "grid", gridTemplateColumns: "1fr 2fr", gap: 16, alignItems: "center",
        }}>
          <div>
            <div className="field-label">Aktivitás · elmúlt 24 hét</div>
            <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
              <div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 20, color: "var(--fg)" }}>{interactions.length}</div>
                <div style={{ fontSize: 10, color: "var(--fg-mute)" }}>interakció</div>
              </div>
              <div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 20, color: "var(--fg)" }}>{tasks.filter(t => t.status !== "done").length}</div>
                <div style={{ fontSize: 10, color: "var(--fg-mute)" }}>nyitott feladat</div>
              </div>
              <div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 20, color: "var(--fg)" }}>{contacts.length}</div>
                <div style={{ fontSize: 10, color: "var(--fg-mute)" }}>munkahely</div>
              </div>
            </div>
          </div>
          <Sparkline data={engagementSeries} width={400} height={48} color="var(--indigo)" />
        </div>

        {/* Tags */}
        <div style={{ marginTop: 14 }}>
          <TagInput taggableType="person" taggableId={person.id} initialTags={initialTags} />
        </div>
      </div>

      {/* Tabs + content */}
      <div style={{ marginTop: 18 }}>
        <div className="tabs-ds">
          {TABS.map(({ key, label, count }) => (
            <button key={key} className={`tab-ds ${tab === key ? "active" : ""}`} onClick={() => setTab(key)}>
              {label}
              <span className="tcount">{count}</span>
            </button>
          ))}
        </div>

        <div className="split-grid" style={{ marginTop: 16 }}>
          {/* Left: tab content */}
          <div>
            {/* Activity */}
            {tab === "activity" && (
              <div className="panel mount">
                <div style={{ padding: "18px 22px" }}>
                  {interactions.length === 0 ? (
                    <div style={{ textAlign: "center", color: "var(--fg-mute)", padding: "32px 0", fontSize: 13 }}>
                      Nincs interakció rögzítve.
                    </div>
                  ) : (
                    <div className="tl">
                      {interactions.map((r) => {
                        const accent = TYPE_COLOR[r.type ?? "note"] ?? "var(--fg-mute)";
                        return (
                          <div key={r.id} className="tl-item" style={{ "--accent": accent } as React.CSSProperties}>
                            <div className="tl-dot" />
                            <div className="tl-head">
                              <span className="who">
                                <span style={{ color: accent, fontWeight: 500 }}>
                                  {TYPE_LABEL[r.type ?? ""] ?? r.type ?? "Ismeretlen"}
                                </span>
                                {r.direction && (
                                  <>
                                    <span style={{ color: "var(--fg-faint)", margin: "0 6px" }}>·</span>
                                    <span style={{ color: "var(--fg-mute)" }}>{interactionDirectionLabel(r.direction)}</span>
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
              </div>
            )}

            {/* Career */}
            {tab === "career" && (
              <div className="panel mount">
                <div style={{ padding: "22px 24px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                    <span className="h-section" style={{ margin: 0 }}>Karrierút</span>
                    <span style={{ fontSize: 11, color: "var(--fg-mute)", fontFamily: "var(--font-mono)" }}>
                      {contacts.length} munkahely
                    </span>
                  </div>
                  <div className="tl">
                    {contacts.map((c, i) => (
                      <div key={c.id} className="tl-item" style={{ "--accent": c.endedAt ? "var(--fg-mute)" : "var(--indigo)" } as React.CSSProperties}>
                        <div className="tl-dot" />
                        <div className="tl-head">
                          <span className="who">
                            <span style={{ fontWeight: 500 }}>{c.role ?? "Munkatárs"}</span>
                            <span style={{ color: "var(--fg-faint)", margin: "0 6px" }}>at</span>
                            <Link href={`/companies/${c.companyId}`} className="row-link">{c.company.name}</Link>
                            {!c.endedAt && (
                              <span className="badge-ds indigo" style={{ marginLeft: 8 }}>current</span>
                            )}
                          </span>
                          <span className="when">
                            {c.startedAt ? formatDate(c.startedAt) : "?"} → {c.endedAt ? formatDate(c.endedAt) : "jelenleg"}
                          </span>
                        </div>
                        <div className="tl-body">{c.company.city}{c.company.city ? " · " : ""}{c.company.vatNumber ?? ""}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 18, padding: 14, border: "1px dashed var(--line-soft)", borderRadius: 8, fontSize: 12, color: "var(--fg-mute)", lineHeight: 1.5 }}>
                    <div style={{ color: "var(--fg)", fontWeight: 500, marginBottom: 4 }}>Miért tároljuk a karriertörténetet</div>
                    Ha a személy céget vált, a teljes kapcsolati történet követi. A kapcsolat az érték — nem az adott munkáltatónál lévő rekord.
                  </div>
                </div>
              </div>
            )}

            {/* Tasks */}
            {tab === "tasks" && (
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
            {tab === "conversations" && (
              <div className="panel mount space-y-4" style={{ padding: "18px 22px" }}>
                {conversations.map((conv) => (
                  <div key={conv.id} style={{ borderBottom: "1px solid var(--line-soft)", paddingBottom: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--violet)", boxShadow: "0 0 6px var(--violet)", flexShrink: 0 }} />
                      <span style={{ fontWeight: 500, color: "var(--fg)", fontSize: 13 }}>
                        {conv.summary ?? conv.channel}
                      </span>
                      {conv.agent && (
                        <span className="badge-ds" style={{ background: "var(--violet-soft, oklch(0.26 0.05 290))", color: "var(--violet)", border: "1px solid oklch(0.45 0.12 290)", fontSize: 10 }}>
                          {conv.agent.name} · {conv.agent.owner ?? conv.agent.role}
                        </span>
                      )}
                      <span className="font-mono-ndt" style={{ marginLeft: "auto", fontSize: 11, color: "var(--fg-faint)" }}>
                        {formatDateTime(conv.startedAt)}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {conv.messages.map((msg) => (
                        <div
                          key={msg.id}
                          style={{
                            padding: "8px 12px",
                            borderRadius: 6,
                            fontSize: 12,
                            lineHeight: 1.5,
                            background: msg.role === "user" ? "var(--bg-0)" : "oklch(0.24 0.04 290 / 0.5)",
                            color: msg.role === "user" ? "var(--fg-soft)" : "var(--fg)",
                            marginLeft: msg.role === "user" ? 0 : 16,
                            border: "1px solid var(--line-soft)",
                          }}
                        >
                          <span className="font-mono-ndt" style={{ fontSize: 9, color: "var(--fg-faint)", display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.1em" }}>
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
          </div>

          {/* Right: sidebar panels */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Current employer */}
            {currentContact && (
              <div className="panel mount">
                <div className="panel-head"><div className="panel-title">Jelenlegi munkahely</div></div>
                <div className="panel-pad">
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{
                      width: 42, height: 42, borderRadius: 8,
                      background: "var(--indigo-soft)", display: "grid", placeItems: "center",
                      fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: 13, color: "var(--indigo)",
                    }}>
                      {currentContact.company.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Link href={`/companies/${currentContact.companyId}`} className="row-link" style={{ fontWeight: 500 }}>
                        {currentContact.company.name}
                      </Link>
                      {currentContact.company.city && (
                        <div style={{ fontSize: 11, color: "var(--fg-mute)", marginTop: 2 }}>
                          {currentContact.company.city}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
                    {currentContact.company.vatNumber && (
                      <div>
                        <div className="field-label">VAT</div>
                        <div className="field-value mono">{currentContact.company.vatNumber}</div>
                      </div>
                    )}
                    {currentContact.role && (
                      <div>
                        <div className="field-label">Beosztás</div>
                        <div className="field-value">{currentContact.role}</div>
                      </div>
                    )}
                    <div>
                      <div className="field-label">Munkaviszony kezdete</div>
                      <div className="field-value mono">{currentContact.startedAt ? formatDate(currentContact.startedAt) : "Ismeretlen"}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Audit */}
            <div className="panel mount">
              <div className="panel-head"><div className="panel-title">History</div></div>
              <div style={{ padding: "12px 16px", maxHeight: 300, overflowY: "auto" }}>
                <AuditLogEntries entries={auditEntries} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
