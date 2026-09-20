"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Download, Users, Pencil, Archive, ArchiveRestore } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PipelineStatusBadge } from "@/components/PipelineStatusBadge";
import { CHANNEL_LABELS, STATUS_LABELS, type ContentChannel, type ContentStatus } from "@/lib/marketing/types";
import { formatRelativeTime } from "@/lib/utils";
import {
  updateCampaign, setCampaignAudience, setCampaignArchived, setCampaignOutreach,
} from "@/app/actions/campaigns";
import { FormField } from "@/components/ui/FormField";

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
      <div style={{ marginBottom: 16 }}>
        <Link href="/marketing/campaigns" className="row-link"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, color: "var(--fg-mute)" }}>
          <ArrowLeft style={{ width: 14, height: 14 }} />
          Vissza a kampányokhoz
        </Link>
      </div>

      <div className="page-head flex items-start justify-between gap-4">
        <div style={{ minWidth: 0 }}>
          <h1 className="page-title flex items-center gap-2">
            {campaign.name}
            {campaign.isArchived && (
              <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 20, background: "var(--bg-0)", color: "var(--fg-faint)", fontFamily: "var(--font-mono)" }}>
                archivált
              </span>
            )}
          </h1>
          {campaign.description && <p className="page-sub">{campaign.description}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setEditOpen(true)} disabled={isPending}>
            <Pencil className="size-3.5" /> Szerkesztés
          </Button>
          <Button variant="outline" onClick={toggleArchive} disabled={isPending}>
            {campaign.isArchived ? <><ArchiveRestore className="size-3.5" /> Visszaállít</> : <><Archive className="size-3.5" /> Archivál</>}
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600" style={{ marginBottom: 12 }}>{error}</p>}

      {/* ── Kiküldés (sender + wave). PROPOSAL (unreviewed HU) ── */}
      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--fg)", marginBottom: 12 }}>
          {/* PROPOSAL (unreviewed HU) */}
          Kiküldés
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <label style={{ fontSize: 14, color: "var(--fg-faint)" }}>Küldő:</label>
          <select
            value={campaign.senderUserId ?? ""}
            onChange={(e) => pickOutreach({ senderUserId: e.target.value ? Number(e.target.value) : null })}
            disabled={isPending}
            style={{ padding: "6px 10px", fontSize: 14, background: "var(--bg-0)", border: "1px solid var(--line-soft)", borderRadius: 6, color: "var(--fg)", outline: "none", minWidth: 160 }}
          >
            {/* PROPOSAL (unreviewed HU) */}
            <option value="">Nincs még küldő</option>
            {senders.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <label style={{ fontSize: 14, color: "var(--fg-faint)" }}>Hullám:</label>
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
        {outreachError && <p className="text-sm text-red-600" style={{ marginTop: 8 }}>{outreachError}</p>}
      </section>

      {/* ── Célközönség (audience) ── */}
      <section style={{ marginBottom: 28 }}>
        <div className="flex items-center justify-between gap-3" style={{ marginBottom: 12 }}>
          <h2 className="flex items-center gap-2" style={{ fontSize: 14, fontWeight: 600, color: "var(--fg)" }}>
            <Users className="size-4" /> Célközönség
          </h2>
          {campaign.slug && (
            <div className="flex items-center gap-3 font-mono-ndt" style={{ fontSize: 12, color: "var(--fg-faint)" }}>
              {/* PROPOSAL (unreviewed HU) */}
              <Link href={`/outreach/campaigns?campaign=${campaign.slug}`} style={{ color: "var(--indigo)" }}>
                Outreach dashboard
              </Link>
              {/* PROPOSAL (unreviewed HU) */}
              <Link href={`/outreach?campaign=${campaign.slug}`} style={{ color: "var(--indigo)" }}>
                Piszkozat sor
              </Link>
            </div>
          )}
          {campaign.audienceViewId !== null && audience.count > 0 && (
            <a
              href={`/marketing/campaigns/${campaign.id}/export`}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm"
              style={{ border: "1px solid var(--line-soft)", color: "var(--fg-soft)", background: "var(--bg-panel)" }}
            >
              <Download className="size-4" /> Export CSV
            </a>
          )}
        </div>

        {/* PROPOSAL (unreviewed HU). Two sentences, because the claim only holds
            once a segment is set: with none, every megkereshető company is a
            target and promising otherwise would be wrong on the screen that
            decides who gets cold-emailed. */}
        <p style={{ fontSize: 14, color: "var(--fg-faint)", marginBottom: 10 }}>
          {campaign.audienceViewId !== null
            ? "Ez a szegmens egyben a kimenő lista is: csak ezekhez a cégekhez készül piszkozat ebben a kampányban."
            : "Amíg nincs szegmens, minden megkereshető cég célpont ebben a kampányban."}
        </p>

        <div className="flex flex-wrap items-center gap-2" style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 14, color: "var(--fg-faint)" }}>Szegmens:</label>
          <select
            value={campaign.audienceViewId ?? ""}
            onChange={(e) => pickAudience(e.target.value ? Number(e.target.value) : null)}
            disabled={isPending}
            style={{ padding: "6px 10px", fontSize: 14, background: "var(--bg-0)", border: "1px solid var(--line-soft)", borderRadius: 6, color: "var(--fg)", outline: "none", minWidth: 200 }}
          >
            <option value="">Nincs célközönség</option>
            {companyViews.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          {campaign.audienceViewId !== null && (
            <span className="font-mono-ndt" style={{ fontSize: 14, color: "var(--indigo)" }}>
              {audience.count.toLocaleString("hu-HU")} cég
            </span>
          )}
        </div>

        {companyViews.length === 0 && campaign.audienceViewId === null && (
          <p style={{ fontSize: 14, color: "var(--fg-faint)" }}>
            Nincs mentett cégszegmens. A <Link href="/companies" style={{ color: "var(--indigo)" }}>Cégek</Link> oldalon
            szűrj, majd mentsd el nézetként: itt választhatóvá válik.
          </p>
        )}

        {campaign.audienceViewId !== null && (
          audience.count === 0 ? (
            <p style={{ fontSize: 14, color: "var(--fg-mute)" }}>Ez a szegmens jelenleg egyetlen céget sem ad vissza.</p>
          ) : (
            <div style={{ border: "1px solid var(--line-soft)", borderRadius: 8, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr>
                    {["Cég", "Adószám", "Város", "Pipeline"].map((h) => (
                      <th key={h} style={{ textAlign: "left", padding: "8px 12px", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--fg-faint)", borderBottom: "1px solid var(--line-soft)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {audience.preview.map((c, i) => (
                    <tr key={i}>
                      <td style={{ padding: "7px 12px", borderBottom: "1px solid var(--line-soft)", color: "var(--fg)" }}>{c.name}</td>
                      <td style={{ padding: "7px 12px", borderBottom: "1px solid var(--line-soft)", color: "var(--fg-mute)" }} className="font-mono-ndt">{c.vatNumber ?? "-"}</td>
                      <td style={{ padding: "7px 12px", borderBottom: "1px solid var(--line-soft)", color: "var(--fg-mute)" }}>
                        {c.city ?? "-"}{c.county && <span style={{ color: "var(--fg-faint)", marginLeft: 6, fontSize: 12 }}>{c.county}</span>}
                      </td>
                      <td style={{ padding: "7px 12px", borderBottom: "1px solid var(--line-soft)" }}><PipelineStatusBadge status={c.pipelineStatus} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {audience.count > audience.preview.length && (
                <div style={{ padding: "8px 12px", fontSize: 12, color: "var(--fg-faint)", background: "var(--bg-0)" }} className="font-mono-ndt">
                  Első {audience.preview.length} a {audience.count.toLocaleString("hu-HU")} cégből; a teljes lista a CSV exportban.
                </div>
              )}
            </div>
          )
        )}
      </section>

      {/* ── Tartalmak (content items) ── */}
      <section>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--fg)", marginBottom: 12 }}>
          Tartalmak <span className="font-mono-ndt" style={{ fontSize: 12, color: "var(--fg-faint)" }}>{contentItems.length}</span>
        </h2>
        {contentItems.length === 0 ? (
          <p style={{ fontSize: 14, color: "var(--fg-faint)" }}>Ehhez a kampányhoz még nincs tartalom.</p>
        ) : (
          <div className="space-y-2">
            {contentItems.map((i) => (
              <Link key={i.id} href={`/marketing/${i.id}`} className="tbl-row flex items-center justify-between gap-3"
                style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid var(--line-soft)", background: "var(--bg-panel)", textDecoration: "none" }}>
                <span style={{ fontSize: 14, color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.title}</span>
                <span className="flex items-center gap-3 font-mono-ndt" style={{ fontSize: 12, color: "var(--fg-faint)", whiteSpace: "nowrap" }}>
                  <span>{CHANNEL_LABELS[i.channel as ContentChannel] ?? i.channel}</span>
                  <span>{STATUS_LABELS[i.status as ContentStatus] ?? i.status}</span>
                  <span>{formatRelativeTime(new Date(i.updatedAt))}</span>
                </span>
              </Link>
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
            {error && <p className="text-sm text-red-600">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)} disabled={isPending}>Mégse</Button>
              <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white" disabled={isPending}>
                {isPending ? "Mentés..." : "Mentés"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
