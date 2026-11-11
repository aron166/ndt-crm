"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus, Users, FileText, Megaphone } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createCampaign } from "@/app/actions/campaigns";
import { FormField } from "@/components/ui/FormField";
import k from "@/components/astryx/page.module.css";
import s from "../marketing.module.css";
import { MarketingHeader } from "../MarketingTabs";

interface CampaignRow {
  id: number;
  name: string;
  description: string | null;
  isArchived: boolean;
  slug: string;
  senderName: string | null;
  currentWave: number | null;
  audienceName: string | null;
  contentCount: number;
}

export function CampaignsClient({
  campaigns, senders,
}: {
  campaigns: CampaignRow[];
  senders: { id: number; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [slug, setSlug] = useState("");
  const [senderUserId, setSenderUserId] = useState("");
  const [currentWave, setCurrentWave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const active = campaigns.filter((c) => !c.isArchived);
  const archived = campaigns.filter((c) => c.isArchived);

  function handleClose() {
    if (isPending) return;
    setOpen(false);
    setName("");
    setDescription("");
    setSlug("");
    setSenderUserId("");
    setCurrentWave("");
    setError(null);
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await createCampaign({
        name,
        description,
        slug: slug || undefined,
        senderUserId: senderUserId ? Number(senderUserId) : null,
        currentWave: currentWave ? Number(currentWave) : null,
      });
      if (res?.error) { setError(res.error); return; }
      setOpen(false);
      setName("");
      setDescription("");
      setSlug("");
      setSenderUserId("");
      setCurrentWave("");
      if (res?.id) router.push(`/marketing/campaigns/${res.id}`);
      else router.refresh();
    });
  }

  return (
    <div className="mount">
      <Link href="/marketing" className={k.back}>
        <ArrowLeft style={{ width: 14, height: 14 }} />
        Vissza a marketinghez
      </Link>

      <MarketingHeader
        active="campaigns"
        title="Kampányok"
        eyebrow="Kampányok és célközönségük: szegmensből kimenő lista."
        actions={
          <button type="button" className={`${k.btn} ${k.btnPrimary}`} onClick={() => setOpen(true)}>
            <Plus className="size-4" /> Új kampány
          </button>
        }
      />

      {campaigns.length === 0 ? (
        <div className={`${k.empty} ${s.emptyC}`}>
          <Megaphone className="size-6 mx-auto mb-2" style={{ opacity: 0.5 }} />
          Még nincs kampány. Hozz létre egyet, és rendelj hozzá célközönséget.
        </div>
      ) : (
        <div className={s.stackLg}>
          <CampaignGroup rows={active} />
          {archived.length > 0 && (
            <div>
              <div className={k.groupHead}>
                <h2 className={k.groupTitle}>Archivált</h2>
                <span className={`${k.muted} ${k.num}`}>{archived.length}</span>
              </div>
              <CampaignGroup rows={archived} />
            </div>
          )}
        </div>
      )}

      <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Új kampány</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <FormField label="Név" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Pl. Q3 NDT outreach" autoFocus />
            </FormField>
            <FormField label="Leírás">
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Opcionális" rows={3} />
            </FormField>
            {/* PROPOSAL (unreviewed HU) */}
            <FormField
              label="Kimenő kulcs (slug)"
              hint="Ez kerül rá minden ehhez a kampányhoz tartozó hideg e-mailre. Üresen hagyva a névből képezzük."
            >
              <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="Opcionális" />
            </FormField>
            {/* PROPOSAL (unreviewed HU) */}
            <FormField label="Küldő">
              <select
                value={senderUserId}
                onChange={(e) => setSenderUserId(e.target.value)}
                className={s.field}
                style={{ width: "100%" }}
              >
                {/* PROPOSAL (unreviewed HU) */}
                <option value="">Nincs még küldő</option>
                {senders.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </FormField>
            {/* PROPOSAL (unreviewed HU) */}
            <FormField label="Hullám">
              <Input
                type="number" min={1} max={52}
                value={currentWave}
                onChange={(e) => setCurrentWave(e.target.value)}
                placeholder="Opcionális"
              />
            </FormField>
            {error && <p className={k.error}>{error}</p>}
            <DialogFooter>
              <button type="button" className={k.btn} onClick={handleClose} disabled={isPending}>Mégse</button>
              <button type="submit" className={`${k.btn} ${k.btnPrimary}`} disabled={isPending}>
                {isPending ? "Létrehozás..." : "Létrehozás"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CampaignGroup({ rows }: { rows: CampaignRow[] }) {
  if (rows.length === 0) {
    return <p className={k.muted}>Nincs aktív kampány.</p>;
  }
  return (
    <div>
      {rows.map((c) => (
        <div key={c.id} className={k.row}>
          <span className={k.bar} />
          <div className={k.cell}>
            <Link href={`/marketing/campaigns/${c.id}`} className={k.name}>{c.name}</Link>
            <span className={k.muted}>
              {c.slug}
              {c.senderName && ` · ${c.senderName}`}
              {c.currentWave != null && ` · ${c.currentWave}. hullám`}
            </span>
          </div>
          <div className={k.cell}>
            {c.description && <span className={k.muted}>{c.description}</span>}
          </div>
          <div className={k.cell}>
            <span className={`${k.muted} ${s.iconText}`} title="Célközönség">
              <Users className="size-3.5" />
              {c.audienceName ?? "-"}
            </span>
          </div>
          <div className={k.cellEnd}>
            <span className={`${k.muted} ${k.num} ${s.iconText}`} title="Tartalmak">
              <FileText className="size-3.5" />
              {c.contentCount}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
