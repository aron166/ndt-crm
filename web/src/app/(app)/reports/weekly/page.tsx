import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCrmUser } from "@/lib/actor";
import { getLeadStatuses } from "@/lib/leads/queries";
import { leadStatusLabel, type LeadStatusDef } from "@/lib/leads/statuses";
import { callOutcomeLabel } from "@/lib/leads/outcomes";
import { getWeeklyReport, lastDays, type WeeklyReport } from "@/lib/reports/weekly";
import { monthUsage } from "@/lib/assistant/cap";
import { REPORT_UI, formatMinutesOrDash } from "@/lib/reports/labels";

const TENANT_ID = 1;
// Hungarian copy (lib/reports/labels.ts) is PROPOSAL until Áron approves.

const R = { textAlign: "right" } as const;

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="panel">
      <div className="panel-head"><div className="panel-title">{title}</div></div>
      <div className="panel-pad">{children}</div>
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  if (rows.length === 0) return <p style={{ fontSize: 13, color: "var(--fg-faint)" }}>{REPORT_UI.empty}</p>;
  return (
    <div style={{ overflowX: "auto" }}>
    <table className="tbl">
      <thead>
        <tr>{head.map((h, i) => <th key={h} style={i === head.length - 1 ? R : undefined}>{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>{r.map((c, j) => <td key={j} style={j === r.length - 1 ? R : undefined}>{c}</td>)}</tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="kpi">
      <div className="k-label">{label}</div>
      <div className="k-value font-mono-ndt" style={{ fontSize: 22 }}>{value}</div>
    </div>
  );
}

const grid = (min: number) => ({ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap: 12 }) as const;

function Window({ title, r, statuses }: { title: string; r: WeeklyReport; statuses: LeadStatusDef[] }) {
  const t = r.tierA;
  return (
    <section className="space-y-4">
      <h2 className="panel-title" style={{ fontSize: 16 }}>{title}</h2>

      <div style={grid(110)}>
        <Stat label={REPORT_UI.leadsCreated} value={r.leadsTotal} />
        <Stat label={REPORT_UI.calls} value={r.callsTotal} />
        <Stat label={REPORT_UI.demosBooked} value={r.demos.booked} />
        <Stat label={REPORT_UI.demosHeld} value={r.demos.held} />
        <Stat label={`${REPORT_UI.tierA} ${REPORT_UI.median}`} value={formatMinutesOrDash(t.medianMinutes)} />
        <Stat label={`${REPORT_UI.tierA} ${REPORT_UI.p90}`} value={formatMinutesOrDash(t.p90Minutes)} />
      </div>

      <Panel title={REPORT_UI.bySourceTier}>
        <Table
          head={[REPORT_UI.source, REPORT_UI.tier, REPORT_UI.leadsCreated]}
          rows={r.leadsBySourceTier.map((x) => [x.source ?? REPORT_UI.unknown, x.tier ?? REPORT_UI.noTier, x.count])}
        />
      </Panel>

      <Panel title={REPORT_UI.tierA}>
        <Table
          head={[REPORT_UI.tierATotal, REPORT_UI.contacted, REPORT_UI.awaitingCall, REPORT_UI.withoutTask]}
          rows={t.total === 0 ? [] : [[t.total, t.contacted, t.awaitingCall, t.withoutTask]]}
        />
      </Panel>

      <Panel title={REPORT_UI.callOutcomes}>
        <Table head={[REPORT_UI.callOutcomes, REPORT_UI.count]} rows={r.callOutcomes.map((x) => [callOutcomeLabel(x.outcome), x.count])} />
      </Panel>

      <Panel title={REPORT_UI.demos}>
        <Table
          head={[REPORT_UI.demosBooked, REPORT_UI.demosScheduled, REPORT_UI.demosHeld]}
          rows={[[r.demos.booked, r.demos.scheduled, r.demos.held]]}
        />
      </Panel>

      <Panel title={REPORT_UI.stageTransitions}>
        <Table
          head={[REPORT_UI.transition, REPORT_UI.count]}
          rows={r.stageTransitions.map((x) => [`${x.from ? leadStatusLabel(x.from, statuses) : "-"} -> ${leadStatusLabel(x.to, statuses)}`, x.count])}
        />
      </Panel>

      <Panel title={REPORT_UI.suppression}>
        <Table
          head={[REPORT_UI.suppressionAdded, REPORT_UI.suppressionCancelled]}
          rows={r.suppression.added + r.suppression.draftsCancelled === 0 ? [] : [[r.suppression.added, r.suppression.draftsCancelled]]}
        />
      </Panel>

      <Panel title={REPORT_UI.topCompanies}>
        <Table
          head={[REPORT_UI.topCompanies, REPORT_UI.touches]}
          rows={r.topCompanies.map((c) => [<Link key={c.companyId} href={`/companies/${c.companyId}`} className="tbl-link">{c.name}</Link>, c.touches])}
        />
      </Panel>
    </section>
  );
}

export default async function WeeklyReportPage() {
  const denied = await requireCrmUser(TENANT_ID);
  if (denied) notFound();

  const [r7, r28, statuses, assistant] = await Promise.all([
    getWeeklyReport(TENANT_ID, lastDays(7)),
    getWeeklyReport(TENANT_ID, lastDays(28)),
    getLeadStatuses(TENANT_ID),
    monthUsage(TENANT_ID),
  ]);

  return (
    <div className="mount space-y-8">
      <div className="page-head">
        <h1 className="page-title">{REPORT_UI.title}</h1>
      </div>
      <p style={{ fontSize: 13, color: "var(--fg-faint)" }}>Asszisztens (hónap): {assistant.calls} hívás, {assistant.tokens} token, kb. ${assistant.costUsd.toFixed(2)}</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(420px, 100%), 1fr))", gap: 24, alignItems: "start" }}>
        <Window title={REPORT_UI.last7} r={r7} statuses={statuses} />
        <Window title={REPORT_UI.last28} r={r28} statuses={statuses} />
      </div>
    </div>
  );
}
