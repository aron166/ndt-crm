"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { REPLY_TYPE_LABEL } from "@/lib/outreach/labels";
import { STATUS_LABELS } from "@/lib/marketing/types";
import { PageHeader } from "@/components/astryx/PageHeader";
import k from "@/components/astryx/page.module.css";
import s from "../outreach.module.css";
import type { CampaignStats, CampaignStepTemplate } from "@/app/actions/outreach-campaigns";

const TIER_ORDER = ["A", "B", "C", "D", "E", "none"] as const;

function fmtPct(v: number | null): string {
  if (v === null) return "–";
  return `${(v * 100).toFixed(1).replace(".", ",")}%`;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={k.card}>
      <div className={k.strong}>{title}</div>
      {children}
    </div>
  );
}

function Stat({ title, value }: { title: string; value: string | number }) {
  return (
    <div className={k.card}>
      <div className={k.stat}>
        <span className={k.statK}>{title}</span>
        <span className={k.statV}>{value}</span>
      </div>
    </div>
  );
}

function Row({ label, value, valueColor }: { label: string; value: string | number; valueColor?: string }) {
  return (
    <div className={k.kv}>
      <span>{label}</span>
      <span className={k.num} style={{ color: valueColor, fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function TargetRow({ label, met }: { label: string; met: boolean }) {
  return (
    <Row
      label={label}
      value={met ? "teljesítve" : "még nem"}
      valueColor={met ? "var(--mint)" : "var(--color-text-secondary)"}
    />
  );
}

export default function CampaignDashboard({
  campaigns,
  senders,
  campaign,
  senderUserId,
  wave,
  stats,
  stepTemplates,
}: {
  campaigns: string[];
  senders: { id: number; name: string }[];
  campaign: string;
  senderUserId: number | null;
  wave: number | null;
  stats: CampaignStats | null;
  stepTemplates: CampaignStepTemplate[];
}) {
  const router = useRouter();

  function navigate(next: { campaign?: string; sender?: number | null; wave?: number | null }) {
    const params = new URLSearchParams();
    const c = next.campaign ?? campaign;
    const s = next.sender !== undefined ? next.sender : senderUserId;
    const w = next.wave !== undefined ? next.wave : wave;
    if (c) params.set("campaign", c);
    if (s != null) params.set("sender", String(s));
    if (w != null) params.set("wave", String(w));
    router.push(`/outreach/campaigns?${params.toString()}`);
  }

  return (
    <div>
      <PageHeader
        title="Kampány dashboard"
        eyebrow={<Link href="/outreach" className={k.back} style={{ marginBottom: 0 }}>← Outreach</Link>}
        actions={
          // PROPOSAL (unreviewed HU)
          <Link href="/marketing/campaigns" className={k.btn}>
            Kampányok kezelése
          </Link>
        }
        filters={
          <>
            <select
              className={s.field}
              aria-label="Kampány"
              value={campaign}
              onChange={(e) => navigate({ campaign: e.target.value })}
            >
              {campaigns.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select
              className={s.field}
              aria-label="Küldő"
              value={senderUserId ?? ""}
              onChange={(e) => navigate({ sender: e.target.value ? parseInt(e.target.value, 10) : null })}
            >
              <option value="">Minden küldő</option>
              {senders.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <select
              className={s.field}
              aria-label="Hullám"
              value={wave ?? ""}
              onChange={(e) => navigate({ wave: e.target.value ? parseInt(e.target.value, 10) : null })}
            >
              <option value="">Minden hullám</option>
              {(stats?.waves ?? []).map((w) => (
                <option key={w} value={w}>{w}. hullám</option>
              ))}
            </select>
          </>
        }
      />

      <div className={s.stack}>
        <section className={k.group}>
          <div className={k.groupHead}>
            <h2 className={k.groupTitle}>Sablonok lépésenként</h2>
          </div>
          {stepTemplates.map((st) => (
            <div key={st.step} className={k.row} data-u={st.template ? (st.template.live ? "done" : undefined) : undefined}>
              <span className={k.bar} />
              <div className={k.cell}>
                {st.template ? (
                  <Link href={`/marketing/${st.template.itemId}`} className={k.name}>
                    {st.template.title}
                  </Link>
                ) : (
                  <span className={k.muted}>Nincs sablon ehhez a lépéshez</span>
                )}
                <span className={k.muted}>{st.step}. érintés</span>
              </div>
              <div className={k.cell}>
                {st.template && (
                  <span className={k.muted}>
                    {STATUS_LABELS[st.template.status as keyof typeof STATUS_LABELS] ?? st.template.status}
                  </span>
                )}
              </div>
              <div className={k.cell}>
                {st.template && (
                  <span className={k.strong} style={{ color: st.template.live ? "var(--mint)" : "var(--color-text-secondary)" }}>
                    {st.template.live ? "Élő" : "Nem élő"}
                  </span>
                )}
              </div>
              <div className={k.cellEnd}>
                {st.template && st.staleCount > 0 && (
                  <span className={k.muted} style={{ color: "var(--amber)" }}>
                    {st.staleCount} piszkozat régebbi sablonváltozatból
                  </span>
                )}
              </div>
            </div>
          ))}
        </section>

        {!stats ? (
          <div className={`${k.empty} ${s.emptyC}`}>
            Nincs adat ehhez a kampányhoz.
          </div>
        ) : (
          <div className={k.cards}>
            <Card title="Megkeresett cégek">
              <Row label="Cégek" value={`${stats.companiesContacted} / ${stats.targetsTotal}`} />
              {stats.audienceTotal != null && (
                // PROPOSAL (unreviewed HU)
                <Row label="Célközönség" value={stats.audienceTotal} />
              )}
            </Card>

            <Card title="Elküldött érintések">
              {stats.sentByStep.map((n, i) => (
                <Row key={i} label={`${i + 1}. érintés`} value={n} />
              ))}
            </Card>

            <Card title="Válaszok érintésenként">
              {stats.repliesByStep.map((n, i) => (
                <Row key={i} label={`${i + 1}. érintés`} value={n} />
              ))}
            </Card>

            <Card title="Válaszok típus szerint">
              {Object.entries(stats.repliesByType).map(([type, n]) => (
                <Row key={type} label={REPLY_TYPE_LABEL[type as keyof typeof REPLY_TYPE_LABEL] ?? type} value={n} />
              ))}
            </Card>

            <Stat title="Válaszarány" value={fmtPct(stats.replyRate)} />
            <Stat title="Hívások" value={stats.calls} />
            <Stat title="Találkozók / demók" value={stats.meetings} />

            <Card title="Leadek tier szerint">
              {TIER_ORDER.map((t) => (
                <Row key={t} label={t === "none" ? "Nincs tier" : t} value={stats.leadsByTier[t] ?? 0} />
              ))}
            </Card>

            <Stat title="Megnyert" value={stats.won} />

            <Card title="Célok">
              <TargetRow label="Válaszarány (cél: ≥25%)" met={stats.targets.replyRate} />
              <TargetRow label="Hívások (cél: ≥4)" met={stats.targets.calls} />
              <TargetRow label="A/B tier lead (cél: ≥1)" met={stats.targets.tierAB} />
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
