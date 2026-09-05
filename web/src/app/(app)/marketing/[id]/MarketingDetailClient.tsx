"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Pencil, Copy, Lock, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatRelativeTime } from "@/lib/utils";
import {
  approveContent, rejectContent, backToEditContent, updateContent,
  publishContent, saveContentMetrics,
} from "@/app/actions/marketing";
import {
  CHANNEL_LABELS, CONTENT_TYPE_LABELS, STATUS_LABELS, STATUS_COLORS,
  type ContentChannel, type ContentType, type ContentStatus,
} from "@/lib/marketing/types";

interface Item {
  id: number;
  title: string;
  body: string;
  channel: string;
  contentType: string;
  status: string;
  internal: boolean;
  source: string;
  externalUrl: string | null;
  reviewNote: string | null;
  campaignName: string | null;
  metrics: Record<string, number> | null;
  createdAt: string;
  updatedAt: string;
}
interface Asset { id: number; kind: string; url: string; caption: string | null }
interface AuditEntry { id: number; action: string; occurredAt: string | Date; changes: unknown }

const METRIC_FIELDS: { key: string; label: string }[] = [
  { key: "impressions", label: "Megjelenések" },
  { key: "reactions", label: "Reakciók" },
  { key: "comments", label: "Hozzászólások" },
  { key: "clicks", label: "Kattintások" },
  { key: "leads", label: "Leadek" },
];

export function MarketingDetailClient({
  item,
  assets,
  auditEntries,
}: {
  item: Item;
  assets: Asset[];
  auditEntries: AuditEntry[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [body, setBody] = useState(item.body);

  const [rejecting, setRejecting] = useState(false);
  const [rejectNote, setRejectNote] = useState("");

  const [publishing, setPublishing] = useState(false);
  const [publishUrl, setPublishUrl] = useState("");
  const [copied, setCopied] = useState(false);

  const [metrics, setMetrics] = useState<Record<string, string>>(
    Object.fromEntries(METRIC_FIELDS.map((f) => [f.key, item.metrics?.[f.key]?.toString() ?? ""])),
  );

  const [error, setError] = useState<string | null>(null);

  const status = item.status as ContentStatus;
  const statusColor = STATUS_COLORS[status] ?? "#64748b";
  const channelLabel = CHANNEL_LABELS[item.channel as ContentChannel] ?? item.channel;
  const typeLabel = CONTENT_TYPE_LABELS[item.contentType as ContentType] ?? item.contentType;
  const isPublished = status === "published";
  const canReview = status === "in_review" || status === "draft" || status === "approved" || status === "scheduled";
  const canPublish = status === "approved" && !item.internal;

  function run(fn: () => Promise<{ error?: string; success?: boolean }>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fn();
        if (res?.error) { setError(res.error); return; }
        after?.();
        router.refresh();
      } catch {
        // A thrown server action would otherwise leave the UI stuck pending with
        // no feedback — surface it.
        setError("Váratlan hiba történt. Próbáld újra.");
      }
    });
  }

  function isSafeHttpUrl(url: string): boolean {
    try {
      const p = new URL(url).protocol;
      return p === "http:" || p === "https:";
    } catch {
      return false;
    }
  }

  async function copyAndOpenPublish() {
    try {
      await navigator.clipboard.writeText(item.body);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can fail (permissions/non-secure context) — still open the
      // publish step so the operator can paste manually and record the URL.
    }
    setPublishing(true);
  }

  return (
    <div style={{ maxWidth: 760 }}>
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: statusColor, background: `${statusColor}1a`, border: `1px solid ${statusColor}40`, borderRadius: 5, padding: "2px 8px", fontWeight: 600 }}>
          {STATUS_LABELS[status] ?? status}
        </span>
        <span style={{ fontSize: 12, color: "var(--fg-mute)" }}>{channelLabel} · {typeLabel}</span>
        {item.campaignName && <span style={{ fontSize: 12, color: "var(--fg-faint)" }}>· {item.campaignName}</span>}
        {item.internal && (
          <span className="flex items-center gap-1" style={{ fontSize: 12, color: "#f59e0b", background: "#f59e0b1a", border: "1px solid #f59e0b40", borderRadius: 5, padding: "2px 7px" }}>
            <Lock style={{ width: 10, height: 10 }} /> Belső — nem publikálható
          </span>
        )}
      </div>

      {error && (
        <div style={{ fontSize: 14, color: "#ef4444", background: "#ef44441a", border: "1px solid #ef444440", borderRadius: 6, padding: "8px 12px", marginBottom: 12 }}>
          {error}
        </div>
      )}

      {/* Title + body (editable) */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-pad">
          {editing ? (
            <div className="space-y-3">
              <div>
                <label className="field-label">Cím</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", fontSize: 16, fontWeight: 500, background: "var(--bg-0)", border: "1px solid var(--line-soft)", borderRadius: 6, color: "var(--fg)", outline: "none" }}
                />
              </div>
              <div>
                <label className="field-label">Szöveg (markdown)</label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={14}
                  style={{ width: "100%", padding: "10px 12px", fontSize: 14, lineHeight: 1.6, background: "var(--bg-0)", border: "1px solid var(--line-soft)", borderRadius: 6, color: "var(--fg)", outline: "none", resize: "vertical", fontFamily: "var(--font-mono-ndt)" }}
                />
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => { setEditing(false); setTitle(item.title); setBody(item.body); }}>Mégse</Button>
                <Button type="button" size="sm" className="btn primary" disabled={isPending}
                  onClick={() => run(() => updateContent(item.id, title, body), () => setEditing(false))}>
                  {isPending ? "Mentés..." : "Mentés"}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3" style={{ marginBottom: 10 }}>
                <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--fg)", lineHeight: 1.3 }}>{item.title}</h1>
                {!isPublished && (
                  <button onClick={() => setEditing(true)} title="Szerkesztés"
                    className="flex items-center gap-1 shrink-0" style={{ fontSize: 14, color: "var(--indigo)", background: "none", border: "none", cursor: "pointer" }}>
                    <Pencil style={{ width: 13, height: 13 }} /> Szerkesztés
                  </button>
                )}
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.65, color: "var(--fg-soft)", whiteSpace: "pre-wrap" }}>
                {item.body}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Assets */}
      {assets.length > 0 && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-pad">
            <div className="field-label" style={{ marginBottom: 8 }}>Mellékletek</div>
            <div className="space-y-2">
              {assets.map((a) => (
                <div key={a.id} className="flex items-center gap-3">
                  {a.kind === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.url} alt={a.caption ?? ""} style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 6, border: "1px solid var(--line-soft)" }} />
                  ) : (
                    <span style={{ fontSize: 12, textTransform: "uppercase", color: "var(--fg-faint)", border: "1px solid var(--line-soft)", borderRadius: 6, padding: "4px 8px" }}>{a.kind}</span>
                  )}
                  <a href={a.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 truncate" style={{ fontSize: 14, color: "var(--indigo)" }}>
                    <span className="truncate">{a.caption || a.url}</span>
                    <ExternalLink style={{ width: 11, height: 11, flexShrink: 0 }} />
                  </a>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Rejection note */}
      {status === "rejected" && item.reviewNote && (
        <div style={{ fontSize: 14, color: "var(--fg-mute)", background: "#ef44440d", border: "1px solid #ef444433", borderRadius: 6, padding: "10px 12px", marginBottom: 16 }}>
          <strong style={{ color: "#ef4444" }}>Elutasítva:</strong> {item.reviewNote}
        </div>
      )}

      {/* Published link — only render as a link for http(s); never href a
          javascript:/data: scheme. */}
      {isPublished && item.externalUrl && (
        isSafeHttpUrl(item.externalUrl) ? (
          <a href={item.externalUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5" style={{ fontSize: 14, color: "var(--indigo)", marginBottom: 16 }}>
            <ExternalLink style={{ width: 13, height: 13 }} /> {item.externalUrl}
          </a>
        ) : (
          <div className="flex items-center gap-1.5" style={{ fontSize: 14, color: "var(--fg-mute)", marginBottom: 16 }}>
            <ExternalLink style={{ width: 13, height: 13 }} /> {item.externalUrl}
          </div>
        )
      )}

      {/* Action bar */}
      {!editing && !isPublished && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-pad">
            {rejecting ? (
              <div className="space-y-2">
                <label className="field-label">Elutasítás indoka (kötelező)</label>
                <textarea value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} rows={2}
                  style={{ width: "100%", padding: "8px 10px", fontSize: 14, background: "var(--bg-0)", border: "1px solid var(--line-soft)", borderRadius: 6, color: "var(--fg)", outline: "none", resize: "vertical" }} />
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => { setRejecting(false); setRejectNote(""); }}>Mégse</Button>
                  <Button type="button" size="sm" disabled={isPending || !rejectNote.trim()}
                    style={{ background: "#ef4444", color: "white" }}
                    onClick={() => run(() => rejectContent(item.id, rejectNote), () => setRejecting(false))}>
                    Elutasítás
                  </Button>
                </div>
              </div>
            ) : publishing ? (
              <div className="space-y-2">
                <label className="field-label">{copied ? "Szöveg vágólapra másolva. " : ""}Megjelent? Illeszd be a linket:</label>
                <input value={publishUrl} onChange={(e) => setPublishUrl(e.target.value)} placeholder="https://..." autoFocus
                  style={{ width: "100%", padding: "8px 10px", fontSize: 14, background: "var(--bg-0)", border: "1px solid var(--line-soft)", borderRadius: 6, color: "var(--fg)", outline: "none" }} />
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => { setPublishing(false); setPublishUrl(""); }}>Mégse</Button>
                  <Button type="button" size="sm" className="btn primary" disabled={isPending || !publishUrl.trim()}
                    onClick={() => run(() => publishContent(item.id, publishUrl), () => setPublishing(false))}>
                    Megjelent ✓
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2 flex-wrap">
                {canReview && status !== "approved" && (
                  <Button type="button" size="sm" className="btn primary" disabled={isPending}
                    onClick={() => run(() => approveContent(item.id))}>
                    <Check style={{ width: 14, height: 14, marginRight: 4 }} /> Jóváhagy
                  </Button>
                )}
                {canPublish && (
                  <Button type="button" size="sm" className="btn primary" disabled={isPending} onClick={copyAndOpenPublish}>
                    <Copy style={{ width: 14, height: 14, marginRight: 4 }} /> Másolás &amp; megjelent
                  </Button>
                )}
                {canReview && (
                  <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={() => setRejecting(true)}>
                    <X style={{ width: 14, height: 14, marginRight: 4 }} /> Elutasít
                  </Button>
                )}
                {status !== "draft" && (
                  <Button type="button" variant="outline" size="sm" disabled={isPending}
                    onClick={() => run(() => backToEditContent(item.id))}>
                    Vissza szerkesztésre
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Metrics (published only) */}
      {isPublished && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-pad">
            <div className="field-label" style={{ marginBottom: 10 }}>Metrikák</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3" style={{ marginBottom: 12 }}>
              {METRIC_FIELDS.map((f) => (
                <div key={f.key}>
                  <label style={{ fontSize: 12, color: "var(--fg-mute)", display: "block", marginBottom: 3 }}>{f.label}</label>
                  <input type="number" inputMode="numeric" value={metrics[f.key]}
                    onChange={(e) => setMetrics((m) => ({ ...m, [f.key]: e.target.value }))}
                    style={{ width: "100%", padding: "6px 8px", fontSize: 14, background: "var(--bg-0)", border: "1px solid var(--line-soft)", borderRadius: 6, color: "var(--fg)", outline: "none" }} />
                </div>
              ))}
            </div>
            <Button type="button" size="sm" className="btn primary" disabled={isPending}
              onClick={() => run(() => saveContentMetrics(item.id, Object.fromEntries(
                METRIC_FIELDS.map((f) => [f.key, metrics[f.key] === "" ? undefined : Number(metrics[f.key])]).filter(([, v]) => v !== undefined && !Number.isNaN(v)),
              )))}>
              Metrikák mentése
            </Button>
          </div>
        </div>
      )}

      {/* History */}
      {auditEntries.length > 0 && (
        <div className="panel">
          <div className="panel-pad">
            <div className="field-label" style={{ marginBottom: 8 }}>Előzmények</div>
            <div className="space-y-1.5">
              {auditEntries.map((e) => (
                <div key={e.id} className="flex items-center justify-between" style={{ fontSize: 12, color: "var(--fg-mute)" }}>
                  <span>{e.action}</span>
                  <span className="font-mono-ndt" style={{ color: "var(--fg-faint)" }}>{formatRelativeTime(e.occurredAt)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
