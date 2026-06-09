"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus, Users, FileText, Megaphone } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createCampaign } from "@/app/actions/campaigns";

interface CampaignRow {
  id: number;
  name: string;
  description: string | null;
  isArchived: boolean;
  audienceName: string | null;
  contentCount: number;
}

export function CampaignsClient({ campaigns }: { campaigns: CampaignRow[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const active = campaigns.filter((c) => !c.isArchived);
  const archived = campaigns.filter((c) => c.isArchived);

  function handleClose() {
    if (isPending) return;
    setOpen(false);
    setName("");
    setDescription("");
    setError(null);
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await createCampaign({ name, description });
      if (res?.error) { setError(res.error); return; }
      setOpen(false);
      setName("");
      setDescription("");
      if (res?.id) router.push(`/marketing/campaigns/${res.id}`);
      else router.refresh();
    });
  }

  return (
    <div className="mount">
      <div style={{ marginBottom: 16 }}>
        <Link href="/marketing" className="row-link"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--fg-mute)" }}>
          <ArrowLeft style={{ width: 14, height: 14 }} />
          Vissza a marketinghez
        </Link>
      </div>

      <div className="page-head flex items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Kampányok</h1>
          <p className="page-sub">Kampányok és célközönségük — szegmensből kimenő lista.</p>
        </div>
        <Button className="bg-indigo-600 hover:bg-indigo-700 text-white" onClick={() => setOpen(true)}>
          <Plus className="size-4" /> Új kampány
        </Button>
      </div>

      {campaigns.length === 0 ? (
        <div className="panel">
          <div className="panel-pad" style={{ textAlign: "center", padding: "48px 0", color: "var(--fg-mute)", fontSize: 13 }}>
            <Megaphone className="size-6 mx-auto mb-2" style={{ opacity: 0.5 }} />
            Még nincs kampány. Hozz létre egyet, és rendelj hozzá célközönséget.
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <CampaignGroup rows={active} />
          {archived.length > 0 && (
            <div>
              <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
                <h2 style={{ fontSize: 13, fontWeight: 600, color: "var(--fg-faint)" }}>Archivált</h2>
                <span className="font-mono-ndt" style={{ fontSize: 11, color: "var(--fg-faint)" }}>{archived.length}</span>
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
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Név *</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Pl. Q3 NDT outreach" autoFocus />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Leírás</label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Opcionális" rows={3} />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose} disabled={isPending}>Mégse</Button>
              <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white" disabled={isPending}>
                {isPending ? "Létrehozás..." : "Létrehozás"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CampaignGroup({ rows }: { rows: CampaignRow[] }) {
  if (rows.length === 0) {
    return <p style={{ fontSize: 13, color: "var(--fg-faint)" }}>Nincs aktív kampány.</p>;
  }
  return (
    <div className="space-y-2">
      {rows.map((c) => (
        <Link
          key={c.id}
          href={`/marketing/campaigns/${c.id}`}
          className="tbl-row mount flex items-center justify-between gap-4"
          style={{
            padding: "12px 14px", borderRadius: 8,
            border: "1px solid var(--line-soft)", background: "var(--bg-panel)",
            textDecoration: "none",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--fg)" }}>{c.name}</div>
            {c.description && (
              <div style={{ fontSize: 12, color: "var(--fg-mute)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 480 }}>
                {c.description}
              </div>
            )}
          </div>
          <div className="flex items-center gap-4 font-mono-ndt" style={{ fontSize: 11, color: "var(--fg-faint)", whiteSpace: "nowrap" }}>
            <span className="flex items-center gap-1" title="Célközönség">
              <Users className="size-3.5" />
              {c.audienceName ?? "—"}
            </span>
            <span className="flex items-center gap-1" title="Tartalmak">
              <FileText className="size-3.5" />
              {c.contentCount}
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}
