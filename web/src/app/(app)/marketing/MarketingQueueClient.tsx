"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Clock, Lock, ExternalLink, Megaphone } from "lucide-react";
import { formatRelativeTime } from "@/lib/utils";
import {
  CHANNEL_LABELS, STATUS_LABELS, STATUS_COLORS, QUEUE_SECTION_ORDER,
  type ContentChannel, type ContentStatus,
} from "@/lib/marketing/types";

interface QueueItem {
  id: number;
  title: string;
  excerpt: string;
  channel: string;
  contentType: string;
  status: string;
  internal: boolean;
  source: string;
  externalUrl: string | null;
  campaignId: number | null;
  campaignName: string | null;
  createdAt: string;
  updatedAt: string;
}

const selectStyle: React.CSSProperties = {
  padding: "6px 10px", fontSize: 14,
  background: "var(--bg-0)", border: "1px solid var(--line-soft)",
  borderRadius: 6, color: "var(--fg)", outline: "none",
};

function channelLabel(c: string) {
  return CHANNEL_LABELS[c as ContentChannel] ?? c;
}
function statusLabel(s: string) {
  return STATUS_LABELS[s as ContentStatus] ?? s;
}
function statusColor(s: string) {
  return STATUS_COLORS[s as ContentStatus] ?? "#64748b";
}

export function MarketingQueueClient({
  items,
  campaigns,
}: {
  items: QueueItem[];
  campaigns: { id: number; name: string }[];
}) {
  const router = useRouter();
  const [campaignFilter, setCampaignFilter] = useState<number | "all">("all");
  const [channelFilter, setChannelFilter] = useState<string>("all");

  const channels = useMemo(
    () => Array.from(new Set(items.map((i) => i.channel))),
    [items],
  );

  const filtered = useMemo(
    () =>
      items.filter(
        (i) =>
          (campaignFilter === "all" || i.campaignId === campaignFilter) &&
          (channelFilter === "all" || i.channel === channelFilter),
      ),
    [items, campaignFilter, channelFilter],
  );

  const reviewCount = items.filter((i) => i.status === "in_review").length;

  return (
    <div className="mount">
      <div className="page-head flex items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Marketing</h1>
          <p className="page-sub">
            Tartalom jóváhagyási sor — AI által generált posztok átnézése, szerkesztése és jóváhagyása.
            {reviewCount > 0 && ` ${reviewCount} vár jóváhagyásra.`}
          </p>
        </div>
        <Link
          href="/marketing/campaigns"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm whitespace-nowrap"
          style={{ border: "1px solid var(--line-soft)", color: "var(--fg-soft)", background: "var(--bg-panel)" }}
        >
          <Megaphone className="size-4" />
          Kampányok
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap" style={{ marginBottom: 18 }}>
        <select
          value={campaignFilter === "all" ? "all" : String(campaignFilter)}
          onChange={(e) => setCampaignFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
          style={{ ...selectStyle, minWidth: 160 }}
        >
          <option value="all">Minden kampány</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select
          value={channelFilter}
          onChange={(e) => setChannelFilter(e.target.value)}
          style={{ ...selectStyle, minWidth: 140 }}
        >
          <option value="all">Minden csatorna</option>
          {channels.map((c) => (
            <option key={c} value={c}>{channelLabel(c)}</option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="panel">
          <div className="panel-pad" style={{ textAlign: "center", padding: "40px 0", color: "var(--fg-mute)", fontSize: 14 }}>
            Nincs tartalom ezekkel a szűrőkkel.
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {QUEUE_SECTION_ORDER.map((section) => {
            const sectionItems = filtered.filter((i) => i.status === section);
            if (sectionItems.length === 0) return null;
            return (
              <section key={section}>
                <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor(section), boxShadow: `0 0 8px ${statusColor(section)}` }} />
                  <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--fg)" }}>{statusLabel(section)}</h2>
                  <span className="font-mono-ndt" style={{ fontSize: 12, color: "var(--fg-faint)" }}>{sectionItems.length}</span>
                </div>
                <div className="space-y-2">
                  {sectionItems.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => router.push(`/marketing/${item.id}`)}
                      className="w-full text-left rounded-lg"
                      style={{
                        background: "var(--bg-panel)",
                        border: "1px solid var(--line-soft)",
                        padding: "12px 14px", cursor: "pointer",
                        transition: "border-color .15s, transform .15s",
                      }}
                      onMouseOver={(e) => { e.currentTarget.style.borderColor = "var(--indigo-line)"; }}
                      onMouseOut={(e) => { e.currentTarget.style.borderColor = "var(--line-soft)"; }}
                    >
                      <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: 5 }}>
                        <span className="font-mono-ndt" style={{ fontSize: 12, color: statusColor(item.status), background: `${statusColor(item.status)}1a`, border: `1px solid ${statusColor(item.status)}40`, borderRadius: 4, padding: "1px 6px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                          {channelLabel(item.channel)}
                        </span>
                        {item.internal && (
                          <span className="flex items-center gap-1" style={{ fontSize: 12, color: "#f59e0b", background: "#f59e0b1a", border: "1px solid #f59e0b40", borderRadius: 4, padding: "1px 6px" }}>
                            <Lock style={{ width: 9, height: 9 }} /> Belső
                          </span>
                        )}
                        {item.campaignName && (
                          <span style={{ fontSize: 12, color: "var(--fg-faint)" }}>{item.campaignName}</span>
                        )}
                        {item.externalUrl && (
                          <ExternalLink style={{ width: 11, height: 11, color: "var(--fg-faint)" }} />
                        )}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: "var(--fg)", marginBottom: 3, lineHeight: 1.3 }}>
                        {item.title}
                      </div>
                      <p style={{ fontSize: 14, color: "var(--fg-mute)", lineHeight: 1.45, marginBottom: 6, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                        {item.excerpt}
                      </p>
                      <div className="flex items-center gap-1 font-mono-ndt" style={{ fontSize: 12, color: "var(--fg-faint)" }}>
                        <Clock style={{ width: 10, height: 10 }} />
                        {formatRelativeTime(item.updatedAt)} · {item.source}
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
