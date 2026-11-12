// Kampányok > <kampány>. Áttekintés: running strip, steps, AI specification. Ad and organic kinds
// are content only for now: their assets and hand-entered numbers, no launch button.
// Hungarian copy is PROPOSAL until Áron approves it.
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, Seg } from "@/components/astryx/PageHeader";
import k from "@/components/astryx/page.module.css";
import { getActor } from "@/lib/actor";
import { campaignPage } from "@/lib/campaigns/hub";
import { assetStateLabel, isContentOnly, kindLabel, missingForSpec, statusLabel } from "@/lib/campaigns/labels";
import type { CampaignKind } from "@/lib/campaigns/rules";
import { RunningStrip } from "@/components/campaigns/RunningStrip";
import { SpecifyPanel, type Proposal } from "./SpecifyPanel";
import { StepsSection } from "./StepsSection";
import { LaunchPanel } from "./LaunchPanel";
import { MemberLoad } from "./MemberLoad";
import { MemberList } from "./MemberList";
import { EmailCheck } from "./EmailCheck";
import { listSenders } from "@/app/actions/outreach-campaigns";
import { campaignEmailCheck } from "@/lib/campaigns/preview";
import { memberRows } from "@/lib/campaigns/hub";
import { CampaignAutomations } from "./CampaignAutomations";
import { AudiencePanel } from "./AudiencePanel";
import { audienceOf } from "@/lib/campaigns/rules";
import { db } from "@/lib/db";
import { getLeadStatuses } from "@/lib/leads/queries";
import { CAMPAIGN_TRIGGERS } from "@/lib/automations/types";
import { MetricsCells } from "./MetricsCells";
import { METRIC_KEYS, METRIC_LABEL } from "@/lib/content/metrics";
import s from "../campaigns.module.css";

export const dynamic = "force-dynamic";
const TENANT_ID = 1;


export default async function CampaignPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ tab?: string; m?: string }> }) {
  const { slug } = await params;
  const { tab: rawTab, m: rawMember } = await searchParams;
  const { userId } = await getActor(TENANT_ID);
  if (userId == null) notFound(); // the (app) layout already refuses; keeps the type narrow
  const d = await campaignPage(TENANT_ID, slug, userId);
  if (!d) notFound();
  const c = d.campaign;
  const contentOnly = isContentOnly(c.kind);
  const tabs = contentOnly
    ? [{ key: "overview", label: "Áttekintés" }]
    : [{ key: "overview", label: "Áttekintés" }, { key: "members", label: "Tagok" }, { key: "launch", label: "Indítás" }, { key: "automations", label: "Automatizálás" }];
  const ymd = (v: Date | null) => (v ? v.toISOString().slice(0, 10) : null);
  const tab = tabs.some((t) => t.key === rawTab) ? rawTab! : "overview";
  const brief = (c.brief ?? {}) as Record<string, unknown>;
  const aud = audienceOf(c.audience);

  return (
    <div className="mount">
      <Link href="/campaigns" className={k.back}>Kampányok</Link>
      <PageHeader
        title={c.name}
        eyebrow={<span className={s.status} data-s={c.status}><span className={s.dot} aria-hidden />{kindLabel(c.kind)} · {statusLabel(c.status)}{d.owner ? ` · felelős: ${d.owner}` : ""}</span>}
        views={tabs.length > 1 ? <Seg label="Kampány nézet" current={tab} items={tabs.map((t) => ({ ...t, href: `/campaigns/${slug}?tab=${t.key}` }))} /> : undefined}
      />

      {d.stats && !contentOnly && c.status !== "draft" && (
        <RunningStrip title="Futás" rows={[{ campaign: { slug: c.slug, name: c.name, kind: c.kind }, stats: d.stats, revenue: d.revenue ?? undefined }]} />
      )}

      {tab === "launch" && (
        <LaunchPanel isAron={d.isAron} d={{
          slug: c.slug, status: c.status, dailyCap: c.dailyCap, startsOn: ymd(c.startsOn), endsOn: ymd(c.endsOn),
          outboundAutomations: c.outboundAutomations, previewHash: d.previewHash, approvedAt: c.approvedAt ? c.approvedAt.toISOString() : null,
          steps: c.steps, assets: d.assets, members: d.members, variants: d.variants,
        }} />
      )}
      {tab === "launch" && <EmailCheck slug={c.slug} c={await campaignEmailCheck(TENANT_ID, c.id, c.senderUserId)} campaignId={c.id} senderUserId={c.senderUserId} senders={await listSenders()} />}
      {tab === "automations" && await automationsTab(c.id, c.outboundAutomations)}
      {tab === "members" && (
        <MemberList slug={c.slug} rows={await memberRows(TENANT_ID, c.id)} openId={Number(rawMember) > 0 ? Number(rawMember) : null} />
      )}
      {tab === "members" && (
        <MemberLoad slug={c.slug} status={c.status} canOperate={d.canOperate} closed={c.status === "stopped" || c.status === "done"}
          batches={d.batches.map((b) => ({ ...b, createdAt: b.createdAt ? b.createdAt.toISOString() : null }))} />
      )}
      {tab === "overview" && <div className={k.split}>
        <div>
          {(brief.offer || brief.audience) ? (
            <section className={k.section} aria-label="Brief">
              <h2 className={k.groupTitle}>Brief</h2>
              {typeof brief.offer === "string" && <div className={k.kv}><span>Cél, ajánlat</span><span>{brief.offer}</span></div>}
              {typeof brief.audience === "string" && <div className={k.kv}><span>Célközönség</span><span>{brief.audience}</span></div>}
            </section>
          ) : null}

          {contentOnly ? (
            <section className={k.section} aria-label="Anyagok és számok">
              <h2 className={k.groupTitle}>Anyagok és számok</h2>
              <p className={k.muted}>Ez a típus egyelőre csak tartalom: nincs tag, nincs indítás. A számokat itt rögzíted kézzel a megjelent anyagoknál, amíg nincs csatoló.</p>
              {d.metrics.length === 0 ? (
                <p className={k.muted}>Nincs anyag ebben a kampányban. <Link href="/marketing" className={k.link}>Marketing</Link></p>
              ) : (
                <div className={k.tableWrap}>
                  <table className={k.table}>
                    <thead><tr><th>Anyag</th><th>Állapot</th>{METRIC_KEYS.map((m) => <th key={m}>{METRIC_LABEL[m]}</th>)}<th /></tr></thead>
                    <tbody>
                      {d.metrics.map((m) => {
                        const a = d.assets.find((x) => x.id === m.id);
                        return (
                          <tr key={m.id}>
                            <td><Link href={`/marketing/${m.id}`} className={k.link}>{m.title}</Link></td>
                            <td><span className={s.state} data-s={a?.status}>{a ? assetStateLabel(a.status) : "-"}</span></td>
                            <MetricsCells id={m.id} published={m.published} metrics={m.metrics} />
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {c.kind == null && <p className={k.muted}>Régi marketing kampány: a beállításai a <Link href={`/marketing/campaigns/${c.id}`} className={k.link}>Marketing kampányoldalon</Link> maradnak.</p>}
            </section>
          ) : (
            <>
              <AudiencePanel slug={c.slug} status={c.status} source={aud.source} stages={aud.stages} canOperate={d.canOperate}
                hasEmailStep={c.steps.some((x) => x.channel === "email")} leadStatuses={(await getLeadStatuses(TENANT_ID)).map((x) => ({ key: x.key, label: x.label }))} />
              <StepsSection slug={c.slug} kind={c.kind as CampaignKind} status={c.status} steps={c.steps} assets={d.assets} emailFirst={aud.source === "prospect_list"} />
            </>
          )}
        </div>
        <div>
          <SpecifyPanel slug={c.slug} proposal={d.proposal as Proposal | null} assets={d.assets} editable={c.status !== "stopped" && c.status !== "done"} canAdoptSteps={c.status === "draft" && !contentOnly}
            missing={missingForSpec({ kind: c.kind, brief: c.brief, steps: c.steps })} openRequest={d.openSpecRequest} canRequest={c.status === "draft" || c.status === "paused"} />
        </div>
      </div>}
    </div>
  );
}

/** Rules scoped to this campaign (trigger_config.campaignId), item 5. Loaded only on the open tab. */
async function automationsTab(campaignId: number, outbound: boolean) {
  const [rules, leadStatuses, users] = await Promise.all([
    db.automationRule.findMany({
      where: { tenantId: TENANT_ID, triggerType: { in: [...CAMPAIGN_TRIGGERS] }, triggerConfig: { path: ["campaignId"], equals: campaignId } },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, isActive: true, triggerType: true, actionType: true, triggerConfig: true, actionConfig: true, lastRunAt: true },
    }),
    getLeadStatuses(TENANT_ID),
    db.user.findMany({ where: { tenantId: TENANT_ID, email: { not: { endsWith: "@system" } } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <CampaignAutomations campaignId={campaignId} outbound={outbound} users={users}
      leadStatuses={leadStatuses.map((x) => ({ key: x.key, label: x.label }))}
      rules={rules.map((r) => ({ ...r, triggerConfig: r.triggerConfig as Record<string, unknown> | null, actionConfig: r.actionConfig as Record<string, unknown>, lastRunAt: r.lastRunAt ? r.lastRunAt.toISOString() : null }))} />
  );
}
