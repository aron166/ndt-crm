"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LeadMoveDialog } from "@/components/LeadMoveDialog";
import { setLeadOutcomeAction, deleteLead, assignLeadAction } from "@/app/actions/leads";
import { LeadEditModal } from "./LeadEditModal";
import { LeadQualificationPanel } from "./LeadQualificationPanel";
import { CallOutcomeModal } from "../CallOutcomeModal";
import type { LeadStatusDef } from "@/lib/leads/statuses";
import type { QualificationQuestion, AnswerSources, QuestionSet } from "@/lib/leads/qualification";
import type { ScriptVariant } from "@/lib/leads/scripts";
import type { LeadOutcome } from "@/lib/leads/outcomes";
import { fullName } from "@/lib/utils";
import { LeadHeader, type HeaderLead } from "./detail/LeadHeader";
import { LeadTabs, parseTab } from "./detail/LeadTabs";
import { OverviewTab, type OpenTask } from "./detail/OverviewTab";
import { CallsTab, type Interaction } from "./detail/CallsTab";
import { HistoryTab, type AuditEntry } from "./detail/HistoryTab";

interface Lead extends HeaderLead {
  id: number;
  status: string | null;
  message: string | null;
  lostReason: string | null;
  outcome: string;
  assignedToId: number | null;
  estimatedValue: number | null;
  receivedDate: string | Date | null;
  convertedDealId: number | null;
  customFields: Record<string, unknown> | null;
  companyId: number | null;
  campaign: string | null;
  contact: {
    id: number; role: string | null; email: string | null; phone: string | null;
    person: { id: number; firstName: string | null; lastName: string | null; email: string | null; phone: string | null } | null;
  } | null;
}

export function LeadDetailClient({
  lead,
  firstContactMin,
  interactions,
  auditEntries,
  statuses,
  users,
  openTasks,
  questions,
  qualification,
  answerSources,
  questionSets,
  scriptVariants,
  callTypeCounts,
  offersPanel,
  keyFacts,
}: {
  lead: Lead;
  firstContactMin: number | null;
  interactions: Interaction[];
  auditEntries: AuditEntry[];
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
  keyFacts: { label: string; value: string }[];
}) {
  const router = useRouter();
  const tab = parseTab(useSearchParams().get("tab"));
  const [status, setStatus] = useState(lead.status ?? "new");
  const [moveTarget, setMoveTarget] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string>(lead.outcome);
  const [outcomePending, startOutcome] = useTransition();
  const [statusPending, startStatus] = useTransition();
  const [converted, setConverted] = useState<number | null>(lead.convertedDealId ?? null);
  const [editing, setEditing] = useState(false);
  const [logging, setLogging] = useState(false);
  // Non-null while the modal is open to correct THAT auto-derived interaction.
  const [correcting, setCorrecting] = useState<number | null>(null);
  const [deleting, startDelete] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const [assignedTo, setAssignedTo] = useState(String(lead.assignedToId ?? ""));
  // Resync when a successful assign (or any other refresh) brings new props in.
  useEffect(() => { setAssignedTo(String(lead.assignedToId ?? "")); }, [lead.assignedToId]);
  // A lost lead stays workable: call log allowed, status select can reopen it.
  const closed = outcome === "won" || converted !== null;

  function handleDelete() {
    const label = lead.serviceInterest || lead.subject || `Lead #${lead.id}`;
    if (!confirm(`Biztosan törlöd ezt a leadet: "${label}"?\n\nA cég, a kapcsolattartó és az interakciók megmaradnak: csak a lead-kártya tűnik el.`)) return;
    startDelete(async () => {
      const res = await deleteLead(lead.id);
      if (res?.error) { alert(res.error); return; }
      router.push("/leads");
    });
  }

  const person = lead.contact?.person;
  const personName = person ? fullName(person.firstName, person.lastName) : null;
  const email = lead.contact?.email ?? person?.email ?? (lead.customFields?.contact_email as string | undefined) ?? null;
  const phone = lead.contact?.phone ?? person?.phone ?? (lead.customFields?.contact_phone as string | undefined) ?? null;

  const cf = lead.customFields ?? {};

  function handleStatusChange(next: string) {
    if (next !== status) setMoveTarget(next);
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

  // Controlled so a failed assign visibly reverts — an uncontrolled select keeps
  // the DOM value the user picked even though the server never took it (same
  // silent-revert class as the kanban drag fix).
  function handleAssign(v: string) {
    const prev = assignedTo;
    setAssignedTo(v);
    startStatus(async () => {
      const res = await assignLeadAction(lead.id, v === "" ? null : Number(v));
      if ("error" in res) {
        setActionError(res.error);
        setAssignedTo(prev);
      }
      router.refresh();
    });
  }

  const displayName = personName || (cf.contact_name as string) || lead.company?.name || lead.subject || "Névtelen";

  return (
    <div>
      <LeadHeader
        lead={lead}
        displayName={displayName}
        personHref={person ? `/persons/${person.id}` : null}
        email={email}
        phone={phone}
        keyFacts={keyFacts}
        firstContactMin={firstContactMin}
        statuses={statuses}
        users={users}
        status={status}
        outcome={outcome}
        assignedTo={assignedTo}
        converted={converted}
        closed={closed}
        statusPending={statusPending}
        outcomePending={outcomePending}
        deleting={deleting}
        onStatus={handleStatusChange}
        onOutcome={handleOutcome}
        onAssign={handleAssign}
        onEdit={() => setEditing(true)}
        onDelete={handleDelete}
        onLog={() => setLogging(true)}
      />

      {moveTarget && (
        <LeadMoveDialog
          leadId={lead.id}
          target={moveTarget}
          targetLabel={statuses.find((s) => s.key === moveTarget)?.label ?? moveTarget}
          onClose={() => setMoveTarget(null)}
          onMoved={() => { setStatus(moveTarget); if (moveTarget === "lost") setOutcome("lost"); setMoveTarget(null); router.refresh(); }}
        />
      )}

      {actionError && (
        <div className="panel" style={{ marginBottom: 12 }}>
          <div className="panel-pad" style={{ fontSize: 14, color: "var(--coral)" }}>{actionError}</div>
        </div>
      )}

      <LeadTabs active={tab} callCount={interactions.length} />

      {tab === "overview" && (
        <OverviewTab openTasks={openTasks} message={lead.message}>
          <LeadQualificationPanel
            leadId={lead.id}
            questions={questions}
            qualification={qualification}
            answerSources={answerSources}
            campaign={lead.campaign}
            receivedDate={lead.receivedDate}
            sets={questionSets}
          />
        </OverviewTab>
      )}
      {tab === "calls" && (
        <CallsTab
          leadId={lead.id}
          interactions={interactions}
          callTypeCounts={callTypeCounts}
          closed={closed}
          onCorrect={(id) => { setCorrecting(id); setLogging(true); }}
        />
      )}
      {tab === "offers" && offersPanel}
      {tab === "history" && (
        <HistoryTab
          sourceApp={lead.sourceApp}
          source={lead.source}
          campaign={lead.campaign}
          outcome={outcome}
          lostReason={lead.lostReason}
          customFields={lead.customFields}
          auditEntries={auditEntries}
        />
      )}

      <CallOutcomeModal
        open={logging}
        onClose={() => { setLogging(false); setCorrecting(null); }}
        leadId={lead.id}
        title={[personName, lead.company?.name].filter(Boolean).join(" · ") || null}
        stageDescription={statuses.find((s) => s.key === status)?.description ?? null}
        onLogged={() => { setCorrecting(null); router.refresh(); }}
        scriptVariants={scriptVariants}
        correctsInteractionId={correcting}
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
    </div>
  );
}
