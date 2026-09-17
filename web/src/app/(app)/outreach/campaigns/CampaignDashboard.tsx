"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { REPLY_TYPE_LABEL } from "@/lib/outreach/labels";
import type { CampaignStats } from "@/app/actions/outreach-campaigns";

const TIER_ORDER = ["A", "B", "C", "D", "E", "none"] as const;

function fmtPct(v: number | null): string {
  if (v === null) return "–";
  return `${(v * 100).toFixed(1).replace(".", ",")}%`;
}

function selectStyle(): React.CSSProperties {
  return {
    fontSize: 14, color: "var(--fg-soft)", background: "var(--bg-raised)",
    border: "1px solid var(--line-soft)", borderRadius: 8, padding: "7px 10px",
  };
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="panel panel-pad" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 14, fontWeight: 500, color: "var(--fg)" }}>{title}</div>
      {children}
    </div>
  );
}

function Row({ label, value, valueColor }: { label: string; value: string | number; valueColor?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 14, flexWrap: "wrap" }}>
      <span style={{ color: "var(--fg-mute)" }}>{label}</span>
      <span style={{ color: valueColor ?? "var(--fg)", fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function TargetRow({ label, met }: { label: string; met: boolean }) {
  return (
    <Row
      label={label}
      value={met ? "teljesítve" : "még nem"}
      valueColor={met ? "var(--mint)" : "var(--fg-mute)"}
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
}: {
  campaigns: string[];
  senders: { id: number; name: string }[];
  campaign: string;
  senderUserId: number | null;
  wave: number | null;
  stats: CampaignStats | null;
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
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="page-head">
        <div>
          <h1 className="page-title">Kampány dashboard</h1>
          <Link href="/outreach" className="page-sub" style={{ color: "var(--fg-mute)" }}>
            ← Outreach
          </Link>
        </div>
      </div>

      <div className="panel panel-pad" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
        <select
          className="input-ds"
          value={campaign}
          onChange={(e) => navigate({ campaign: e.target.value })}
          style={selectStyle()}
        >
          {campaigns.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select
          className="input-ds"
          value={senderUserId ?? ""}
          onChange={(e) => navigate({ sender: e.target.value ? parseInt(e.target.value, 10) : null })}
          style={selectStyle()}
        >
          <option value="">Minden küldő</option>
          {senders.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <select
          className="input-ds"
          value={wave ?? ""}
          onChange={(e) => navigate({ wave: e.target.value ? parseInt(e.target.value, 10) : null })}
          style={selectStyle()}
        >
          <option value="">Minden hullám</option>
          {(stats?.waves ?? []).map((w) => (
            <option key={w} value={w}>{w}. hullám</option>
          ))}
        </select>
      </div>

      {!stats ? (
        <div className="panel panel-pad" style={{ fontSize: 14, color: "var(--fg-faint)", textAlign: "center" }}>
          Nincs adat ehhez a kampányhoz.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
          <Card title="Megkeresett cégek">
            <Row label="Cégek" value={`${stats.companiesContacted} / ${stats.targetsTotal}`} />
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

          <Card title="Válaszarány">
            <Row label="Válaszarány" value={fmtPct(stats.replyRate)} />
          </Card>

          <Card title="Hívások">
            <Row label="Hívások" value={stats.calls} />
          </Card>

          <Card title="Találkozók / demók">
            <Row label="Találkozók / demók" value={stats.meetings} />
          </Card>

          <Card title="Leadek tier szerint">
            {TIER_ORDER.map((t) => (
              <Row key={t} label={t === "none" ? "Nincs tier" : t} value={stats.leadsByTier[t] ?? 0} />
            ))}
          </Card>

          <Card title="Megnyert">
            <Row label="Megnyert" value={stats.won} />
          </Card>

          <Card title="Célok">
            <TargetRow label="Válaszarány — cél: ≥25%" met={stats.targets.replyRate} />
            <TargetRow label="Hívások — cél: ≥4" met={stats.targets.calls} />
            <TargetRow label="A/B tier lead — cél: ≥1" met={stats.targets.tierAB} />
          </Card>
        </div>
      )}
    </div>
  );
}
