"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Download, Users, Pencil, Archive, ArchiveRestore } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PipelineStatusBadge } from "@/components/PipelineStatusBadge";
import { CHANNEL_LABELS, STATUS_LABELS, type ContentChannel, type ContentStatus } from "@/lib/marketing/types";
import { formatRelativeTime } from "@/lib/utils";
import {
  updateCampaign, setCampaignAudience, setCampaignArchived, setCampaignOutreach,
} from "@/app/actions/campaigns";
import { FormField } from "@/components/ui/FormField";
import { PageHeader } from "@/components/astryx/PageHeader";
import k from "@/components/astryx/page.module.css";
import s from "../../marketing.module.css";

interface Campaign {
  id: number;
  name: string;
  description: string | null;
  isArchived: boolean;
  slug: string;
  senderUserId: number | null;
  currentWave: number | null;
  audienceViewId: number | null;
  audienceName: string | null;
}
interface Audience {
  count: number;
  previewLimit: number;
  preview: { name: string; vatNumber: string | null; city: string | null; county: string | null; pipelineStatus: string | null }[];
}
interface ContentRow { id: number; title: string; channel: string; status: string; updatedAt: string; }

export function CampaignDetailClient({
  campaign, audience, contentItems, companyViews, senders,
}: {
  campaign: Campaign;
  audience: Audience;
  contentItems: ContentRow[];
  companyViews: { id: number; name: string }[];
  senders: { id: number; name: string }[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editOpen, setEditOpen] = useState(false);
  const [name, setName] = useState(campaign.name);
  const [description, setDescription] = useState(campaign.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [outreachError, setOutreachError] = useState<string | null>(null);

  function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await updateCampaign(campaign.id, { name, description });
      if (res?.error) { setError(res.error); return; }
      setEditOpen(false);
      router.refresh();
    });
  }

  function pickAudience(viewId: number | null) {
    startTransition(async () => {
      const res = await setCampaignAudience(campaign.id, viewId);
      if (res?.error) { setError(res.error); return; }
      router.refresh();
    });
  }

  function pickOutreach(input: { senderUserId?: number | null; currentWave?: number | null }) {
    setOutreachError(null);
    startTransition(async () => {
      const res = await setCampaignOutreach(campaign.id, input);
      if (res?.error) { setOutreachError(res.error); return; }
      router.refresh();
    });
  }

  function toggleArchive() {
    startTransition(async () => {
      await setCampaignArchived(campaign.id, !campaign.isArchived);
      router.refresh();
    });
  }

  return (
    <div className="mount">
      <Link href="/marketing/campaigns" className={k.back}>
        <ArrowLeft style={{ width: 14, height: 14 }} />
        Vissza a kampányokhoz
      </Link>

      <PageHeader
        title={
          <>
            {campaign.name}
            {campaign.isArchived && (
              <span className="badge-ds slate" style={{ marginLeft: 12, verticalAlign: "middle" }}>
                archivált
              </span>
            )}
          </>
        }
        eyebrow={campaign.description ?? undefined}
        actions={
          <>
            <button type="button" className={k.btn} onClick={() => setEditOpen(true)} disabled={isPending}>
              <Pencil className="size-3.5" /> Szerkesztés
            </button>
            <button type="button" className={k.btn} onClick={toggleArchive} disabled={isPending}>
              {campaign.isArchived ? <><ArchiveRestore className="size-3.5" /> Visszaállít</> : <><Archive className="size-3.5" /> Archivál</>}
            </button>
          </>
        }
      />

      {error && <p className={k.error} style={{ marginBottom: 12 }}>{error}</p>}

      {/* ── Kiküldés (sender + wave). PROPOSAL (unreviewed HU) ── */}
      <section className={k.section}>
        <h2 className={k.h2}>
          {/* PROPOSAL (unreviewed HU) */}
          Kiküldés
        </h2>
        <div className={s.inlineRow}>
          <label className={k.muted}>Küldő:</label>
          <select
            value={campaign.senderUserId ?? ""}
            onChange={(e) => pickOutreach({ senderUserId: e.target.value ? Number(e.target.value) : null })}
            disabled={isPending}
            className={s.field}
            style={{ minWidth: 160 }}
          >
            {/* PROPOSAL (unreviewed HU) */}
            <option value="">Nincs még küldő</option>
            {senders.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <label className={k.muted}>Hullám:</label>
          <Input
            type="number" min={1} max={52}
            defaultValue={campaign.currentWave ?? ""}
            onBlur={(e) => {
              // A blur fires whether or not anything changed. Without this the
              // page would write and audit the same wave on every tab-out.
              const next = e.target.value ? Number(e.target.value) : null;
              if (next === (campaign.currentWave ?? null)) return;
              pickOutreach({ currentWave: next });
            }}
            disabled={isPending}
            style={{ width: 90 }}
          />
        </div>
        {outreachError && <p className={k.error} style={{ marginTop: 8 }}>{outreachError}</p>}
      </section>

      {/* ── Célközönség (audience) ── */}
      <section className={k.section}>
        <div className={s.sectionHeadRow}>
          <h2 className={`${k.h2} ${s.iconText}`}>
            <Users className="size-4" /> Célközönség
          </h2>
          {campaign.slug && (
            <div className={k.meta}>
              {/* PROPOSAL (unreviewed HU) */}
              <Link href={`/outreach/campaigns?campaign=${campaign.slug}`} className={k.link}>
                Outreach dashboard
              </Link>
              {/* PROPOSAL (unreviewed HU) */}
              <Link href={`/outreach?campaign=${campaign.slug}`} className={k.link}>
                Piszkozat sor
              </Link>
            </div>
          )}
          {campaign.audienceViewId !== null && audience.count > 0 && (
            <a
              href={`/marketing/campaigns/${campaign.id}/export`}
              className={k.btn}
            >
              <Download className="size-4" /> Export CSV
            </a>
          )}
        </div>

        {/* PROPOSAL (unreviewed HU). Two sentences, because the claim only holds
            once a segment is set: with none, every megkereshető company is a
            target and promising otherwise would be wrong on the screen that
            decides who gets cold-emailed. */}
        <p className={k.muted} style={{ margin: 0 }}>
          {campaign.audienceViewId !== null
            ? "Ez a szegmens egyben a kimenő lista is: csak ezekhez a cégekhez készül piszkozat ebben a kampányban."
            : "Amíg nincs szegmens, minden megkereshető cég célpont ebben a kampányban."}
        </p>

        <div className={s.inlineRow}>
          <label className={k.muted}>Szegmens:</label>
          <select
            value={campaign.audienceViewId ?? ""}
            onChange={(e) => pickAudience(e.target.value ? Number(e.target.value) : null)}
            disabled={isPending}
            className={s.field}
            style={{ minWidth: 200 }}
          >
            <option value="">Nincs célközönség</option>
            {companyViews.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          {campaign.audienceViewId !== null && (
            <span className={`${k.strong} ${k.num}`} style={{ color: "var(--ui-text-link)" }}>
              {audience.count.toLocaleString("hu-HU")} cég
            </span>
          )}
        </div>

        {companyViews.length === 0 && campaign.audienceViewId === null && (
          <p className={k.muted} style={{ margin: 0 }}>
            Nincs mentett cégszegmens. A <Link href="/companies" className={k.link}>Cégek</Link> oldalon
            szűrj, majd mentsd el nézetként: itt választhatóvá válik.
          </p>
        )}

        {campaign.audienceViewId !== null && (
          audience.count === 0 ? (
            <p className={k.muted} style={{ margin: 0 }}>Ez a szegmens jelenleg egyetlen céget sem ad vissza.</p>
          ) : (
            <div>
              <div className={k.tableWrap}>
                <table className={k.table}>
                  <thead>
                    <tr>
                      {["Cég", "Adószám", "Város", "Pipeline"].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {audience.preview.map((c, i) => (
                      <tr key={i}>
                        <td>{c.name}</td>
                        <td className={k.num}>{c.vatNumber ?? "-"}</td>
                        <td>
                          {c.city ?? "-"}{c.county && <span className={k.muted} style={{ marginLeft: 6 }}>{c.county}</span>}
                        </td>
                        <td><PipelineStatusBadge status={c.pipelineStatus} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {audience.count > audience.preview.length && (
                <div className={`${k.cardMuted} ${k.muted} ${k.num}`}>
                  Első {audience.preview.length} a {audience.count.toLocaleString("hu-HU")} cégből; a teljes lista a CSV exportban.
                </div>
              )}
            </div>
          )
        )}
      </section>

      {/* ── Tartalmak (content items) ── */}
      <section className={k.section}>
        <h2 className={k.h2}>
          Tartalmak <span className={`${k.muted} ${k.num}`}>{contentItems.length}</span>
        </h2>
        {contentItems.length === 0 ? (
          <p className={k.muted} style={{ margin: 0 }}>Ehhez a kampányhoz még nincs tartalom.</p>
        ) : (
          <div>
            {contentItems.map((i) => (
              <div key={i.id} className={k.row}>
                <span className={k.bar} />
                <div className={k.cell}>
                  <Link href={`/marketing/${i.id}`} className={k.name}>{i.title}</Link>
                </div>
                <div className={k.cell}>
                  <span className={k.muted}>{CHANNEL_LABELS[i.channel as ContentChannel] ?? i.channel}</span>
                </div>
                <div className={k.cell}>
                  <span className={k.muted}>{STATUS_LABELS[i.status as ContentStatus] ?? i.status}</span>
                </div>
                <div className={k.cellEnd}>
                  <span className={k.muted}>{formatRelativeTime(new Date(i.updatedAt))}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <Dialog open={editOpen} onOpenChange={(o) => !o && !isPending && setEditOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Kampány szerkesztése</DialogTitle>
          </DialogHeader>
          <form onSubmit={saveEdit} className="space-y-4">
            <FormField label="Név" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </FormField>
            <FormField label="Leírás">
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            </FormField>
            {error && <p className={k.error}>{error}</p>}
            <DialogFooter>
              <button type="button" className={k.btn} onClick={() => setEditOpen(false)} disabled={isPending}>Mégse</button>
              <button type="submit" className={`${k.btn} ${k.btnPrimary}`} disabled={isPending}>
                {isPending ? "Mentés..." : "Mentés"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
