import { db } from "@/lib/db";
import { getActor } from "@/lib/actor";
import { demoHostsFromSettings } from "@/lib/booking/queries";
import { offerConfigFromSettings } from "@/lib/offers/offer";
import { renderBody } from "@/lib/nurture/render";
import { MarketingTabs } from "../MarketingTabs";
import { TemplateList } from "./TemplateList";

const TENANT_ID = 1;
export const dynamic = "force-dynamic";

// PROPOSAL copy: all Hungarian labels in this file
const SEGMENT: Record<string, string> = { service: "Szolgáltatás", device: "Eszköz", info: "Tájékozódik", lost: "Elveszett / most nem" };
const AUDIENCE: Record<string, string> = { all: "mindenkinek", opt_in: "csak feliratkozottnak", non_opt_in: "feliratkozási meghívó" };
const fmt = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ");

export default async function NurturePage() {
  const [tenant, templates, sequences, enrollGroups, events, actor] = await Promise.all([
    db.tenant.findUnique({ where: { id: TENANT_ID }, select: { settings: true } }),
    db.nurtureTemplate.findMany({ where: { tenantId: TENANT_ID }, orderBy: { key: "asc" } }),
    db.nurtureSequence.findMany({ where: { tenantId: TENANT_ID }, orderBy: { id: "asc" }, include: { steps: { orderBy: { position: "asc" } } } }),
    db.nurtureEnrollment.groupBy({ by: ["sequenceId", "status"], where: { tenantId: TENANT_ID }, _count: { _all: true } }),
    db.appEvent.findMany({ where: { tenantId: TENANT_ID, eventType: { startsWith: "nurture_" } }, orderBy: { createdAt: "desc" }, take: 20 }),
    getActor(TENANT_ID),
  ]);
  const settings = (tenant?.settings ?? {}) as Record<string, unknown>;
  const enabled = settings.nurture_enabled === true;
  const canApprove = actor.userId != null && demoHostsFromSettings(settings).aron === actor.userId;
  const issuer = offerConfigFromSettings(settings).issuer;
  const byKey = new Map(templates.map((t) => [t.key, t]));
  const waiting = templates.filter((t) => t.status === "proposal").length;

  const rows = templates.map((t) => {
    const r = renderBody(t.bodyMd, { templateKey: t.key, position: 1, trackUrl: (u) => u, unsubscribeUrl: "#", issuer });
    return { id: t.id, key: t.key, subject: t.subject, preview: t.preview, status: t.status, approvedAt: t.approvedAt ? fmt(t.approvedAt) : null, html: r.html, text: r.text };
  });

  const stepState = (key: string) => {
    const t = byKey.get(key);
    if (!t) return "hiányzik";
    const base = t.status === "approved" ? "jóváhagyva" : "javaslat";
    return t.requiresAsset ? `${base}, hiányzó anyag: ${t.requiresAsset}` : base;
  };

  const ev = (p: unknown) => (p ?? {}) as { leadId?: number; templateKey?: string; reason?: string };

  return (
    <div className="mount">
      <MarketingTabs active="inbox" />

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-pad">
          <strong>Hírlevél-küldés: {enabled ? "BE" : "KI"}</strong>
          <span style={{ color: "var(--fg-mute)", marginLeft: 12, fontSize: 13 }}>Aláírásra váró sablon: {waiting}</span>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-head">Szekvenciák</div>
        <div className="panel-pad">
          {sequences.length === 0 && <p style={{ color: "var(--fg-mute)", fontSize: 13 }}>Nincs szekvencia.</p>}
          {sequences.map((s) => (
            <div key={s.id} style={{ marginBottom: 16 }}>
              <strong style={{ fontSize: 14 }}>{SEGMENT[s.segment] ?? s.segment}</strong>
              <span style={{ fontSize: 12, color: "var(--fg-mute)", marginLeft: 8 }}>
                {s.name}{s.active ? "" : " (inaktív)"} | {enrollGroups.filter((g) => g.sequenceId === s.id).map((g) => `${g.status}: ${g._count._all}`).join(", ") || "nincs feliratkozás"}
              </span>
              {s.steps.map((st) => (
                <div key={st.id} style={{ fontSize: 13, padding: "4px 0", display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <span>{st.delayDays}. nap</span>
                  <span className="font-mono-ndt">{st.templateKey}</span>
                  <span style={{ color: "var(--fg-mute)" }}>{AUDIENCE[st.audience] ?? st.audience}</span>
                  <span>{stepState(st.templateKey)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-head">Sablonok</div>
        <div className="panel-pad">
          {rows.length === 0 && <p style={{ color: "var(--fg-mute)", fontSize: 13 }}>Nincs sablon.</p>}
          <TemplateList rows={rows} canApprove={canApprove} />
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">Legutóbbi események</div>
        <div className="panel-pad" style={{ overflowX: "auto" }}>
          {events.map((e) => {
            const p = ev(e.payload);
            return (
              <div key={e.id} className="font-mono-ndt" style={{ fontSize: 12, padding: "3px 0", whiteSpace: "nowrap" }}>
                {fmt(e.createdAt)} {e.eventType} lead:{p.leadId ?? "-"} {p.templateKey ?? ""} {p.reason ?? ""}
              </div>
            );
          })}
          {events.length === 0 && <p style={{ color: "var(--fg-mute)", fontSize: 13 }}>Még nincs esemény.</p>}
        </div>
      </div>
    </div>
  );
}
