"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { LeadMoveDialog } from "@/components/LeadMoveDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Button as AButton } from "@astryxdesign/core/Button";
import { useToast } from "@astryxdesign/core/Toast";
import { useDeferredCall, DEFER_MS } from "./v2/useDeferredCall";
import { DEFAULT_TRANSITIONS } from "@/lib/leads/lifecycle";
import { SendEmailModal } from "@/components/SendEmailModal";
import { moveLead, setLeadOutcomeAction, deleteLead, assignLeadAction, logLeadCall } from "@/app/actions/leads";
import { LeadEditModal } from "./LeadEditModal";
import { LeadQualificationPanel } from "./LeadQualificationPanel";
import { CallOutcomeModal } from "../CallOutcomeModal";
import type { LeadStatusDef } from "@/lib/leads/statuses";
import type { QualificationQuestion, AnswerSources, QuestionSet } from "@/lib/leads/qualification";
import type { ScriptVariant } from "@/lib/leads/scripts";
import { CALL_OUTCOMES, type CallOutcomeKey, type LeadOutcome } from "@/lib/leads/outcomes";
import type { BookingKind } from "@/lib/booking/priority";
import { suggestNextSteps, type Suggestion } from "@/lib/leads/suggestions";
import { buildTimeline } from "@/lib/leads/timeline";
import { isAutoOutcome } from "@/lib/calls/auto-outcome";
import { formatRelativeTime, fullName } from "@/lib/utils";
import { formatMinutes } from "@/lib/leads/first-contact";
import { OpenTasks, type OpenTask } from "./detail/OverviewTab";
import { Header, CallBar } from "./v2/Header";
import { Situation } from "./v2/Situation";
import { Suggestions } from "./v2/Suggestions";
import { Timeline } from "./v2/Timeline";
import { Details, sourceRows, type Fact } from "./v2/Details";
import { CallMode } from "./v2/CallMode";
import { BookingDrawer } from "./v2/BookingDrawer";
import s from "./v2/lead2.module.css";

export interface Interaction {
  id: number;
  type: string | null;
  direction: string | null;
  notes: string | null;
  outcome: string | null;
  occurredAt: string | Date;
  leadId?: number | null;
  person: { id: number; firstName: string | null; lastName: string | null } | null;
  user?: { name: string } | null;
  autoConfidence: number | null;
  supersedesInteractionId?: number | null;
}

export interface AuditEntry {
  id: number;
  action: string;
  occurredAt: string | Date;
  changes: unknown;
}

interface Lead {
  id: number;
  status: string | null;
  message: string | null;
  lostReason: string | null;
  outcome: string;
  assignedToId: number | null;
  estimatedValue: number | null;
  receivedDate: string | Date | null;
  createdAt: string | Date;
  convertedDealId: number | null;
  customFields: Record<string, unknown> | null;
  companyId: number | null;
  campaign: string | null;
  source: string | null;
  sourceApp: string | null;
  subject: string | null;
  serviceInterest: string | null;
  tier: string | null;
  nextAction: string | null;
  nextDue: string | Date | null;
  attempts: number;
  company: { id: number; name: string; city: string | null; website: string | null } | null;
  contact: {
    id: number; role: string | null; email: string | null; phone: string | null;
    person: { id: number; firstName: string | null; lastName: string | null; email: string | null; phone: string | null } | null;
  } | null;
}

type BookingCtx = { kind: BookingKind; event?: string; to?: string };

export function LeadDetailClient({
  lead, firstContactMin, interactions, auditEntries, statusHistory, datedTasks, offers, documents, statuses, users, openTasks,
  questions, qualification, answerSources, questionSets, scriptVariants, callTypeCounts, offersPanel, keyFacts, leadOpen,
}: {
  lead: Lead;
  firstContactMin: number | null;
  interactions: Interaction[];
  auditEntries: AuditEntry[];
  statusHistory: { id: number; fromStatus: string | null; toStatus: string; event: string; at: string | Date; actorUser: { name: string } | null }[];
  datedTasks: { id: number; title: string; type: string | null; status: string; dueDate: string | Date | null }[];
  offers: { id: number; quoteNumber: string; status: string; createdAt: string | Date; sentAt: string | Date | null; acceptedAt: string | Date | null }[];
  documents: { id: number; kind: string; number: string; createdAt: string | Date }[];
  statuses: LeadStatusDef[];
  users: { id: number; name: string }[];
  openTasks: OpenTask[];
  questions: QualificationQuestion[];
  qualification: Record<string, string>;
  answerSources: AnswerSources;
  questionSets: QuestionSet[];
  scriptVariants: ScriptVariant[];
  callTypeCounts: { callType: string | null; count: number }[];
  offersPanel: React.ReactNode;
  keyFacts: Fact[];
  leadOpen: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const calling = params.get("mode") === "call";
  const tab = params.get("tab");
  const status = lead.status ?? "new";
  const [moveTarget, setMoveTarget] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string>(lead.outcome);
  const [assignedTo, setAssignedTo] = useState(String(lead.assignedToId ?? ""));
  const [converted, setConverted] = useState<number | null>(lead.convertedDealId ?? null);
  const [editing, setEditing] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [logging, setLogging] = useState(false);
  const [callNote, setCallNote] = useState("");
  const [padOutcome, setPadOutcome] = useState<CallOutcomeKey | undefined>(undefined);
  // Non-null while the modal is open to correct THAT auto-derived interaction.
  const [correcting, setCorrecting] = useState<number | null>(null);
  // ?book=1 (from the board / drive "Foglalt meeting" outcome) opens the drawer on arrival.
  // Same kind / event / stage the outcome pad uses, so the stage move still happens.
  const [booking, setBooking] = useState<BookingCtx | null>(() => {
    if (params.get("book") !== "1") return null;
    const sg = suggestNextSteps(lead.status ?? "new").find((x) => x.kind === "booking");
    return { kind: sg?.bookingKind ?? "single_machine_demo", event: sg?.event, to: sg?.to };
  });
  // Old ?tab=overview / ?tab=offers deep links land with the details open.
  const [detailsOpen, setDetailsOpen] = useState(tab === "overview" || tab === "offers");
  const [actionError, setActionError] = useState<string | null>(null);
  // An outcome note, not an error: booked, but the stage stays (the kind did not match the suggestion).
  const [actionNote, setActionNote] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const moveLock = useRef(false);
  const bookedLock = useRef(false);
  const [outcomePending, startOutcome] = useTransition();
  const [assignPending, startAssign] = useTransition();
  const [movePending, startMove] = useTransition();
  const [deleting, startDelete] = useTransition();
  // A lost lead stays workable: call log allowed, it can be reopened.
  const closed = outcome === "won" || converted !== null;

  const person = lead.contact?.person;
  const personName = person ? fullName(person.firstName, person.lastName) : null;
  const cf = lead.customFields ?? {};
  const contactName = personName || (cf.contact_name as string | undefined) || null;
  const email = lead.contact?.email ?? person?.email ?? (cf.contact_email as string | undefined) ?? null;
  const phone = lead.contact?.phone ?? person?.phone ?? (cf.contact_phone as string | undefined) ?? null;
  const displayName = lead.company?.name ?? contactName ?? lead.subject ?? "Névtelen";
  const stageLabel = statuses.find((x) => x.key === status)?.label ?? status;
  const ownerName = users.find((u) => String(u.id) === assignedTo)?.name ?? null;

  const stageLabels = Object.fromEntries(statuses.map((x) => [x.key, x.label]));
  const timeline = buildTimeline({ interactions, auditEntries, statusHistory, tasks: datedTasks, offers, documents, lead, stageLabels });
  const now = new Date();
  const last = timeline.find((i) => new Date(i.at) <= now) ?? null;
  const autoPct: Record<string, number> = {};
  for (const r of interactions) if (r.leadId === lead.id && isAutoOutcome(r)) autoPct[`i-${r.id}`] = Math.round((r.autoConfidence ?? 0) * 100);

  const suggestions = closed ? [] : suggestNextSteps(status, { hasPhone: !!phone, hasEmail: !!email });
  // Every stage the rules allow from here; the dialog collects a reason where one is needed.
  const stageTargets = [...new Set(DEFAULT_TRANSITIONS.filter((x) => x.from === status && x.to !== status).map((x) => x.to))];
  const headerCall = !calling;
  const firstIsCall = suggestions[0]?.kind === "call";
  const firstPrimary = !(headerCall && firstIsCall);
  const callOutline = headerCall && suggestions.length > 0 && !firstIsCall;
  const bookingSuggestion = suggestNextSteps(status).find((x) => x.kind === "booking");

  // A form slug ("service_concrete") is already a label in the key facts; only free text belongs here.
  const rawSubject = lead.serviceInterest || lead.subject;
  const subject = rawSubject && !/^[a-z0-9]+(_[a-z0-9]+)+$/.test(rawSubject) ? rawSubject : null;
  const fiveFacts: Fact[] = [
    { label: "Érkezett", value: formatRelativeTime(lead.receivedDate ?? lead.createdAt) },
    { label: "Első kontakt", value: firstContactMin != null ? `${formatMinutes(firstContactMin)} a beérkezés után` : "Még nincs kontakt" },
    ...keyFacts,
  ].slice(0, 5);
  const allFacts: Fact[] = [...(subject ? [{ label: "Tárgy", value: subject }] : []), ...fiveFacts, ...keyFacts.slice(3)];

  function setMode(call: boolean) {
    const q = new URLSearchParams(params.toString());
    if (call) q.set("mode", "call"); else q.delete("mode");
    router.replace(q.size ? `${pathname}?${q}` : pathname, { scroll: false });
  }

  function openDetails(anchor: string) {
    setDetailsOpen(true);
    setTimeout(() => {
      const el = document.getElementById(anchor);
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
      if (el instanceof HTMLSelectElement) el.focus();
    }, 60);
  }

  function runMove(to: string, event?: string) {
    if (moveLock.current) return;
    moveLock.current = true;
    setActionError(null);
    startMove(async () => {
      try {
        const res = await moveLead(lead.id, to, event ? { event } : {});
        if (res && "error" in res) setActionError(res.error);
        router.refresh();
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "Nem sikerült a szakaszváltás."); // PROPOSAL copy
      } finally {
        moveLock.current = false;
      }
    });
  }

  function runSuggestion(x: Suggestion) {
    setActionError(null);
    if (x.kind === "call") setMode(true);
    else if (x.kind === "booking") setBooking({ kind: x.bookingKind ?? "single_machine_demo", event: x.event, to: x.to });
    else if (x.kind === "offer") openDetails("offers");
    else if (x.kind === "email") setEmailing(true);
    else if (x.kind === "signoff") router.push(`/leads/${lead.id}/signoff`);
    else if (x.to === "lost" || x.to === "recall") setMoveTarget(x.to); // needs a reason: the dialog asks for it
    else if (x.to) runMove(x.to, x.event);
  }

  // One click logs these two; the write is deferred so Undo can cancel it (interactions are append-only).
  const toast = useToast();
  const pendingKey = `pendingCall:${lead.id}`;
  // Only deletes the record of the same outcome, so an earlier commit cannot remove a later one's record.
  const clearPending = (outcome: string) => {
    try {
      const raw = sessionStorage.getItem(pendingKey);
      if (raw && (JSON.parse(raw) as { outcome: string }).outcome === outcome) sessionStorage.removeItem(pendingKey);
    } catch { /* storage blocked or unreadable */ }
  };
  // Global toast: still shown if the page was left before the write finished.
  const failed = (msg: string, outcome: string) => { clearPending(outcome); toast({ body: msg, type: "error", autoHideDuration: 10000 }); };
  const quickCall = useDeferredCall<{ outcome: CallOutcomeKey; note: string }>((item) => {
    logLeadCall(lead.id, item).then((res) => {
      if ("error" in res) { failed(res.error, item.outcome); return; }
      clearPending(item.outcome);
      // Keep what was typed since the click.
      setCallNote((cur) => (cur.trim() === item.note ? "" : cur));
      router.refresh();
    }).catch(() => failed("Mentés sikertelen: próbáld újra", item.outcome));
  });

  // A log that never got its answer (tab killed mid-write): tell, never replay (append-only).
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(pendingKey);
      if (!raw) return;
      const p = JSON.parse(raw) as { outcome: string; at: number };
      if (Date.now() - p.at > 10_000) {
        sessionStorage.removeItem(pendingKey);
        const label = CALL_OUTCOMES.find((o) => o.key === p.outcome)?.label ?? p.outcome;
        toast({ body: `A call log may not have been saved: ${label}, open the timeline to check`, type: "error", autoHideDuration: 15000 }); // PROPOSAL copy
      }
    } catch { /* unreadable: ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Board / drive hand the typed note over once; ?book=1 is consumed here.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(`callNote:${lead.id}`);
      if (raw) {
        sessionStorage.removeItem(`callNote:${lead.id}`);
        const v = JSON.parse(raw) as { note?: string; at?: number };
        if (v.note && typeof v.at === "number" && Date.now() - v.at < 30 * 60_000) setCallNote(v.note);
      }
    } catch { /* storage blocked */ }
    if (params.get("book") === "1") {
      const q = new URLSearchParams(params.toString());
      q.delete("book");
      router.replace(q.size ? `${pathname}?${q}` : pathname, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function quickLog(k: "no_answer" | "wrong_number") {
    setActionError(null);
    const label = CALL_OUTCOMES.find((o) => o.key === k)?.label ?? k;
    const item = { outcome: k, note: callNote.trim() || label };
    if (!quickCall.schedule(k, item)) return;
    try { sessionStorage.setItem(pendingKey, JSON.stringify({ outcome: k, at: Date.now() })); } catch { /* storage blocked */ }
    // PROPOSAL copy
    const dismiss = toast({
      body: `Logged: ${label}`, autoHideDuration: DEFER_MS,
      endContent: <AButton variant="ghost" size="sm" label="Undo" onClick={() => {
        if (quickCall.cancel(k)) clearPending(k); else toast({ body: "Already saved", autoHideDuration: 3000 });
        dismiss();
      }} />,
    });
    quickCall.bindDismiss(k, dismiss);
  }

  function pickOutcome(k: CallOutcomeKey) {
    if (k === "no_answer" || k === "wrong_number") { quickLog(k); return; }
    // IF never books on its own: it opens the drawer.
    if (k === "meeting_booked") { setBooking({ kind: bookingSuggestion?.bookingKind ?? "single_machine_demo", event: bookingSuggestion?.event, to: bookingSuggestion?.to }); return; }
    setPadOutcome(k);
    setLogging(true);
  }

  // The drawer already booked: a failed log is retried with the same task id, never re-booked.
  function logBookedCall(taskId: number, note: string) {
    const fail = () => toast({
      body: "Booked, but the call was not logged", type: "error", autoHideDuration: 15000,
      endContent: <AButton variant="ghost" size="sm" label="Log it again" onClick={() => logBookedCall(taskId, note)} />,
    });
    logLeadCall(lead.id, { outcome: "meeting_booked", note, existingBookingTaskId: taskId }).then((res) => {
      if ("error" in res) { fail(); return; }
      setCallNote("");
      router.refresh();
    }).catch(fail);
  }

  function handleBooked(kind: BookingKind, taskId: number) {
    if (bookedLock.current) return;
    bookedLock.current = true;
    try {
      const b = booking;
      // Close first so a failed follow-up move shows on the page, not behind the drawer.
      setBooking(null);
      // Call mode: the call log (against the meeting the drawer just created) moves the stage itself.
      if (calling) {
        const retry = { taskId, note: callNote.trim() || "Foglalt meeting" };
        logBookedCall(retry.taskId, retry.note);
      } else if (b?.event && b.to) {
        if (kind === b.kind) runMove(b.to, b.event);
        else setActionNote("Lefoglalva; a szakasz nem változott."); // PROPOSAL copy
      }
    } finally {
      bookedLock.current = false;
    }
  }

  function handleDelete() {
    const label = lead.serviceInterest || lead.subject || `Lead #${lead.id}`;
    if (!confirm(`Biztosan törlöd ezt a leadet: "${label}"?\n\nA cég, a kapcsolattartó és az interakciók megmaradnak: csak a lead-kártya tűnik el.`)) return;
    startDelete(async () => {
      const res = await deleteLead(lead.id);
      if (res?.error) { alert(res.error); return; }
      router.push("/leads");
    });
  }

  function handleOutcome(next: LeadOutcome) {
    // Lost opens the move dialog so the user picks a Hungarian reason; cancel leaves the select as is.
    if (next === "lost") { setMoveTarget("lost"); return; }
    const prev = outcome;
    setOutcome(next);
    setActionError(null);
    startOutcome(async () => {
      const res = await setLeadOutcomeAction(lead.id, next);
      if ("error" in res) { setOutcome(prev); setActionError(res.error); router.refresh(); return; }
      if (res.dealId) setConverted(res.dealId);
      router.refresh();
    });
  }

  // Controlled so a failed assign visibly reverts (an uncontrolled select keeps the DOM value the server never took).
  function handleAssign(v: string) {
    const prev = assignedTo;
    setAssignedTo(v);
    startAssign(async () => {
      const res = await assignLeadAction(lead.id, v === "" ? null : Number(v));
      if ("error" in res) { setActionError(res.error); setAssignedTo(prev); }
      router.refresh();
    });
  }

  return (
    <div className={s.page}>
      {params.get("from") === "drive" && <Link href="/drive" className={s.back}>Back to the queue</Link>}
      <Header
        name={displayName}
        companyId={lead.company?.id ?? null}
        contactName={contactName}
        personHref={person ? `/persons/${person.id}` : null}
        role={lead.contact?.role ?? null}
        town={lead.company?.city ?? null}
        phone={phone}
        email={email}
        stageLabel={stageLabel}
        tier={lead.tier}
        ownerName={ownerName}
        calling={calling}
        callOutline={callOutline}
        canMove={!closed && stageTargets.length > 0}
        onStage={() => setPicking(true)}
        canClose={status !== "lost" && !closed}
        deleting={deleting}
        onCall={() => setMode(true)}
        onEdit={() => setEditing(true)}
        onOwner={() => openDetails("lead-owner")}
        onClose={() => setMoveTarget("lost")}
        onDelete={handleDelete}
      />

      {actionError && <p className={s.error} role="alert">{actionError}</p>}
      {actionNote && <p className={s.muted} role="status">{actionNote}</p>}

      {calling && (
        <CallMode
          closed={closed}
          note={callNote}
          onNote={setCallNote}
          onPick={pickOutcome}
          onLog={() => { setPadOutcome(undefined); setLogging(true); }}
          onDone={() => setMode(false)}
        />
      )}

      <div className={s.split}>
        <div className={s.left}>
          <Situation
            last={last}
            strip={{ status, stageLabel, nextAction: lead.nextAction, nextDue: lead.nextDue, ownerName, attempts: lead.attempts }}
          />
          <Suggestions items={suggestions} pending={movePending} firstPrimary={firstPrimary} onRun={runSuggestion} />
          <Timeline
            items={timeline}
            phone={phone}
            autoPct={autoPct}
            onCorrect={closed ? undefined : (id) => { setCorrecting(id); setPadOutcome(undefined); setLogging(true); }}
          />
        </div>
        <div className={s.right}>
          <Details
            open={detailsOpen}
            onToggle={setDetailsOpen}
            facts={allFacts}
            source={sourceRows({ sourceApp: lead.sourceApp, source: lead.source, campaign: lead.campaign, outcome, lostReason: lead.lostReason, customFields: lead.customFields })}
            callTypeCounts={callTypeCounts}
            users={users}
            assignedTo={assignedTo}
            assignPending={assignPending}
            onAssign={handleAssign}
            outcome={outcome}
            outcomePending={outcomePending}
            onOutcome={handleOutcome}
            converted={converted}
            website={lead.company?.website ?? null}
          >
            <section id="facts" className={s.section}>
              <h3 className={s.h3}>{/* PROPOSAL copy */}Amit tudunk</h3>
              <LeadQualificationPanel
                leadId={lead.id}
                questions={questions}
                qualification={qualification}
                answerSources={answerSources}
                campaign={lead.campaign}
                receivedDate={lead.receivedDate}
                sets={questionSets}
              />
            </section>
            <section id="offers" className={s.section}>
              <h3 className={s.h3}>{/* PROPOSAL copy */}Ajánlatok és dokumentumok</h3>
              {/* Wrapped: a server-built node as a direct sibling here trips a dev key warning. */}
              <div>{offersPanel}</div>
            </section>
            <section id="tasks" className={s.section}>
              <h3 className={s.h3}>{/* PROPOSAL copy */}Nyitott feladatok</h3>
              <OpenTasks openTasks={openTasks} />
            </section>
          </Details>
          <section className={s.card} aria-label="Röviden">
            <h2 className={s.h2}>{/* PROPOSAL copy */}Röviden</h2>
            <div className={s.facts}>
              {fiveFacts.map((f) => <div key={f.label} className={s.fact}><span>{f.label}</span><span>{f.value}</span></div>)}
            </div>
          </section>
        </div>
      </div>

      <Dialog open={picking} onOpenChange={setPicking}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{/* PROPOSAL copy */}Szakasz váltása</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            {stageTargets.map((k) => (
              <Button key={k} type="button" variant="outline" onClick={() => { setPicking(false); setMoveTarget(k); }}>
                {statuses.find((x) => x.key === k)?.label ?? k}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {moveTarget && (
        <LeadMoveDialog
          leadId={lead.id}
          target={moveTarget}
          targetLabel={statuses.find((x) => x.key === moveTarget)?.label ?? moveTarget}
          onClose={() => setMoveTarget(null)}
          onMoved={() => { if (moveTarget === "lost") setOutcome("lost"); setMoveTarget(null); router.refresh(); }}
        />
      )}

      <BookingDrawer
        open={booking !== null}
        kind={booking?.kind ?? "single_machine_demo"}
        leadId={lead.id}
        leadOpen={leadOpen}
        onClose={() => setBooking(null)}
        onBooked={handleBooked}
      />

      <SendEmailModal
        open={emailing}
        onClose={() => setEmailing(false)}
        companyId={lead.companyId}
        personId={person?.id ?? null}
        defaultTo={email ?? undefined}
        contextLabel={displayName}
      />

      <CallOutcomeModal
        open={logging}
        onClose={() => { setLogging(false); setCorrecting(null); setPadOutcome(undefined); }}
        leadId={lead.id}
        title={[personName, lead.company?.name].filter(Boolean).join(" · ") || null}
        stageDescription={statuses.find((x) => x.key === status)?.description ?? null}
        onLogged={() => { setCorrecting(null); setCallNote(""); router.refresh(); }}
        scriptVariants={scriptVariants}
        correctsInteractionId={correcting}
        initialOutcome={padOutcome}
        initialNote={correcting ? undefined : callNote || undefined}
        onBook={(note) => { setCallNote(note); setLogging(false); setPadOutcome(undefined); setBooking({ kind: bookingSuggestion?.bookingKind ?? "single_machine_demo", event: bookingSuggestion?.event, to: bookingSuggestion?.to }); }}
      />

      <LeadEditModal
        open={editing}
        onClose={() => setEditing(false)}
        onSaved={() => router.refresh()}
        initial={{
          id: lead.id,
          subject: lead.subject,
          serviceInterest: lead.serviceInterest,
          source: lead.source,
          estimatedValue: lead.estimatedValue,
          message: lead.message,
          lostReason: lead.lostReason,
          companyId: lead.companyId,
          companyName: lead.company?.name ?? null,
          campaign: lead.campaign,
        }}
      />

      {!calling && <CallBar phone={phone} onCall={() => setMode(true)} outline={callOutline} />}
    </div>
  );
}
