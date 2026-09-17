"use client";

import { useState, useTransition, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { FileText, Link2, Upload, X, Check, PencilLine, RotateCcw, Pencil } from "lucide-react";
import { Markdown } from "@/lib/content/markdown";
import { wordDiff } from "@/lib/content/diff";
import {
  UI, CATEGORY_LABEL, VERDICT_LABEL, VERDICT_ACTION, AUTHOR_LABEL,
} from "@/lib/content/labels";
import { STATUS_LABELS, STATUS_COLORS } from "@/lib/marketing/types";
import type { ContentCategory, Verdict } from "@/lib/content/types";
import type { ReviewPageData } from "@/lib/content/queries";
import {
  submitContentReview, saveContentVersion, requestAssetUpload, archiveContent,
} from "@/app/actions/content";
import { publishContent, saveContentMetrics } from "@/app/actions/marketing";
import { createClient } from "@/lib/supabase/client";
import "./review.css";

// Bucket name duplicated here on purpose: storage.ts is server-only and must
// never be imported into a client component (spec instruction).
const CONTENT_BUCKET = "content-assets";

type VersionRow = ReviewPageData["versions"][number];
type AssetRow = VersionRow["assets"][number];

const METRIC_FIELDS: { key: string; label: string }[] = [
  { key: "impressions", label: "Megjelenések" },
  { key: "reactions", label: "Reakciók" },
  { key: "comments", label: "Hozzászólások" },
  { key: "clicks", label: "Kattintások" },
  { key: "leads", label: "Leadek" },
];

function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

function isHttpUrl(u: string): boolean {
  try {
    const p = new URL(u);
    return p.protocol === "http:" || p.protocol === "https:";
  } catch {
    return false;
  }
}

function fileNameOf(path: string): string {
  return path.split("/").pop()?.replace(/^[0-9a-f-]{36}-/, "") ?? path;
}

export function ReviewClient({
  data,
  userId,
  signedUrls,
}: {
  data: ReviewPageData;
  userId: number | null;
  signedUrls: Record<string, string>;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [isPending, startTransition] = useTransition();

  const { item, versions, reviewers, isReviewer } = data;

  const currentVersion = versions.find((v) => v.id === item.currentVersionId) ?? null;
  const liveVersion = item.liveVersionId ? versions.find((v) => v.id === item.liveVersionId) ?? null : null;

  const [viewedId, setViewedId] = useState<number | null>(item.currentVersionId ?? versions[0]?.id ?? null);
  const viewed = versions.find((v) => v.id === viewedId) ?? currentVersion ?? versions[0] ?? null;
  const prevVersion = viewed?.basedOnVersionId
    ? versions.find((v) => v.id === viewed.basedOnVersionId) ?? null
    : null;

  const [showDiff, setShowDiff] = useState(false);
  const diffParts = useMemo(
    () => (showDiff && prevVersion && viewed ? wordDiff(prevVersion.body, viewed.body) : []),
    [showDiff, prevVersion?.body, viewed?.body],
  );
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const [actionError, setActionError] = useState<string | null>(null);
  const [reviewPanel, setReviewPanel] = useState<"changes" | "rewrite" | null>(null);
  const [reviewComment, setReviewComment] = useState("");

  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState("");
  const [editChangeNote, setEditChangeNote] = useState("");
  const [editKeep, setEditKeep] = useState<Set<number>>(new Set());
  const [newUploads, setNewUploads] = useState<{ path: string; caption: string }[]>([]);
  const [newLinks, setNewLinks] = useState<{ url: string; caption: string }[]>([]);
  const [uploading, setUploading] = useState<{ id: string; name: string; status: string }[]>([]);
  const [addingLink, setAddingLink] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkCaption, setLinkCaption] = useState("");

  const [publishUrl, setPublishUrl] = useState(item.externalUrl ?? "");
  const [copied, setCopied] = useState(false);
  const [metrics, setMetrics] = useState<Record<string, string>>(
    Object.fromEntries(METRIC_FIELDS.map((f) => [f.key, item.metrics?.[f.key]?.toString() ?? ""])),
  );

  useEffect(() => {
    if (!lightboxSrc) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setLightboxSrc(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxSrc]);

  function run(fn: () => Promise<{ ok: boolean; error?: string } | { error?: string; success?: boolean }>, after?: () => void) {
    setActionError(null);
    startTransition(async () => {
      try {
        const res = await fn();
        const err = "ok" in res ? (!res.ok ? res.error : undefined) : res.error;
        if (err) { setActionError(err); return; }
        after?.();
        router.refresh();
      } catch {
        setActionError("Váratlan hiba történt. Próbáld újra.");
      }
    });
  }

  function submitVerdict(verdict: Verdict, comment?: string) {
    if (!viewed || viewed.id !== item.currentVersionId) return;
    run(
      () => submitContentReview({ versionId: viewed.id, verdict, comment }),
      () => { setReviewPanel(null); setReviewComment(""); },
    );
  }

  function openEditor() {
    setEditBody(currentVersion?.body ?? "");
    setEditChangeNote("");
    setEditKeep(new Set((currentVersion?.assets ?? []).map((a) => a.id)));
    setNewUploads([]);
    setNewLinks([]);
    setUploading([]);
    setActionError(null);
    setEditing(true);
  }

  function saveEdit() {
    if (!item.currentVersionId) return;
    if (!confirm(UI.resetWarning)) return;
    run(
      () => saveContentVersion({
        itemId: item.id,
        basedOnVersionId: item.currentVersionId!,
        body: editBody,
        changeNote: editChangeNote.trim() || undefined,
        keepAssetIds: Array.from(editKeep),
        uploads: newUploads.map(({ path, caption }) => ({ path, caption: caption.trim() || undefined })),
        links: newLinks.map((l) => ({ url: l.url, caption: l.caption.trim() || undefined })),
      }),
      () => setEditing(false),
    );
  }

  async function handleFiles(files: FileList) {
    for (const file of Array.from(files)) {
      const uid = `${file.name}-${Date.now()}-${Math.random()}`;
      setUploading((u) => [...u, { id: uid, name: file.name, status: "feltöltés…" }]);
      try {
        const res = await requestAssetUpload({
          itemId: item.id, fileName: file.name, mimeType: file.type, sizeBytes: file.size,
        });
        if (!res.ok) { setUploading((u) => u.map((x) => (x.id === uid ? { ...x, status: res.error } : x))); continue; }
        const { error } = await supabase.storage.from(CONTENT_BUCKET).uploadToSignedUrl(res.path, res.token, file);
        if (error) { setUploading((u) => u.map((x) => (x.id === uid ? { ...x, status: error.message } : x))); continue; }
        setNewUploads((list) => [...list, { path: res.path, caption: "" }]);
        setUploading((u) => u.filter((x) => x.id !== uid));
      } catch {
        setUploading((u) => u.map((x) => (x.id === uid ? { ...x, status: "Váratlan hiba történt. Próbáld újra." } : x)));
      }
    }
  }

  function confirmAddLink() {
    if (!isHttpUrl(linkUrl)) return;
    setNewLinks((l) => [...l, { url: linkUrl.trim(), caption: linkCaption.trim() }]);
    setLinkUrl(""); setLinkCaption(""); setAddingLink(false);
  }

  async function handleCopy() {
    if (!liveVersion) return;
    try {
      await navigator.clipboard.writeText(liveVersion.body);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can fail silently (permissions/non-secure context) — nothing to recover here.
    }
  }

  function saveMetrics() {
    const payload = Object.fromEntries(
      METRIC_FIELDS
        .map((f) => [f.key, metrics[f.key] === "" ? undefined : Number(metrics[f.key])] as const)
        .filter(([, v]) => v !== undefined && !Number.isNaN(v)),
    );
    run(() => saveContentMetrics(item.id, payload));
  }

  function assetHref(a: AssetRow): string | null {
    if (a.kind === "link") return isHttpUrl(a.url) ? a.url : null;
    if (a.storagePath) return signedUrls[a.storagePath] ?? null;
    // Assets posted by URL through POST /api/content (no upload).
    return isHttpUrl(a.url) ? a.url : null;
  }

  const categoryLabel = CATEGORY_LABEL[item.category as ContentCategory] ?? item.category;
  const statusColor = STATUS_COLORS[item.status as keyof typeof STATUS_COLORS] ?? "#64748b";
  const myVerdict = userId != null ? currentVersion?.reviews.find((r) => r.reviewerId === userId)?.verdict ?? null : null;

  const pipelineActive: Record<string, number | null> = {
    draft: 1, in_review: 1, changes_requested: 1, rewrite_requested: 1, ai_working: 1, live: 2, archived: null,
  };
  const activeStep = pipelineActive[item.status] ?? null;

  const reviewEligible = isReviewer && item.status !== "archived" && item.status !== "ai_working" && item.currentVersionId != null;
  const canReviewButtons = reviewEligible && viewed?.id === item.currentVersionId;
  const showOldVersionNotice = reviewEligible && viewed != null && viewed.id !== item.currentVersionId;
  const canEditButton = userId != null && item.status !== "archived";
  const showActionBar = canReviewButtons || showOldVersionNotice || canEditButton;
  const showLive = item.liveVersionId != null && !item.internal;

  return (
    <div className={cx("review-wrap", showActionBar && "has-actionbar")}>
      {/* Header */}
      <div className="review-header">
        <h1 className="review-title">{item.title}</h1>
        <div className="review-chips">
          <span className="badge-ds slate">{categoryLabel}</span>
          {item.format && <span className="badge-ds slate">{item.format.replace(/_/g, " ")}</span>}
          {item.purpose && <span className="badge-ds slate">{item.purpose}</span>}
          {item.campaign && <span className="badge-ds slate">{item.campaign.name}</span>}
          <span
            className="status-chip"
            style={{ color: statusColor, background: `${statusColor}1a`, borderColor: `${statusColor}40` }}
          >
            {STATUS_LABELS[item.status as keyof typeof STATUS_LABELS] ?? item.status}
          </span>
        </div>

        {reviewers.length > 0 && (
          <div className="review-verdict-row">
            {reviewers.map((r) => {
              const v = currentVersion?.reviews.find((rv) => rv.reviewerId === r.id)?.verdict as Verdict | undefined;
              return (
                <span key={r.id} className="reviewer-verdict">
                  <span className="reviewer-name">{r.name}</span>
                  <span className={cx("reviewer-status", v && `verdict-${v}`)}>
                    {v ? VERDICT_LABEL[v] : UI.notYetReviewed}
                  </span>
                </span>
              );
            })}
          </div>
        )}

        <div className="pipeline-strip">
          {UI.pipeline.map((label, i) => (
            <span key={label} className={cx("pipeline-step", i === activeStep && "active")}>{label}</span>
          ))}
        </div>

        {liveVersion && liveVersion.id !== item.currentVersionId && (
          <p className="review-note">{UI.liveServes(liveVersion.number)}</p>
        )}
        {item.status === "ai_working" && <p className="review-note amber">{UI.aiBusy}</p>}
        {item.needsHumanAsset && <p className="review-note amber">{UI.needsHumanAsset}</p>}
        {!isReviewer && <p className="review-note">{UI.notReviewer}</p>}
        {reviewers.length < 2 && <p className="review-note">{UI.noReviewers}</p>}
        {actionError && !editing && !reviewPanel && <p className="review-error">{actionError}</p>}
      </div>

      <div className="review-grid">
        {/* Reading pane */}
        <main className="review-main">
          {viewed && (
            <>
              <Markdown source={viewed.body} className="review-body" />

              {viewed.assets.length > 0 && (
                <div className="review-assets">
                  {viewed.assets.map((a) => {
                    const href = assetHref(a);
                    if (!href) return null;
                    if (a.kind === "image") {
                      return (
                        <button key={a.id} type="button" className="asset-image-btn" onClick={() => setLightboxSrc(href)}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={href} alt={a.caption ?? ""} className="asset-image" />
                          {a.caption && <span className="asset-caption">{a.caption}</span>}
                        </button>
                      );
                    }
                    if (a.kind === "video") {
                      return (
                        <div key={a.id} className="asset-video">
                          <video controls preload="metadata" src={href} />
                          {a.caption && <span className="asset-caption">{a.caption}</span>}
                        </div>
                      );
                    }
                    if (a.kind === "file") {
                      return (
                        <div key={a.id} className="asset-file">
                          <FileText size={16} aria-hidden />
                          <a href={href} target="_blank" rel="noopener noreferrer">Megnyitás</a>
                          <a href={href} download>{UI.download}</a>
                          {a.caption && <span className="asset-caption">{a.caption}</span>}
                        </div>
                      );
                    }
                    return (
                      <div key={a.id} className="asset-link">
                        <Link2 size={16} aria-hidden />
                        <a href={href} target="_blank" rel="noopener noreferrer">{a.caption || href}</a>
                      </div>
                    );
                  })}
                </div>
              )}

              {prevVersion && (
                <button type="button" className="btn btn-sm diff-toggle" onClick={() => setShowDiff((d) => !d)}>
                  {showDiff ? UI.hideDiff : UI.showDiff}
                </button>
              )}
              {showDiff && prevVersion && viewed && (
                <div className="review-diff">
                  <div className="diff-legend">
                    <span className="diff-mark del">−</span>
                    <span className="diff-mark ins">+</span>
                  </div>
                  <p className="diff-body">
                    {diffParts.map((part, i) => {
                      if (part.type === "same") return <span key={i}>{part.text}</span>;
                      if (part.type === "del") return <del key={i}>{part.text}</del>;
                      return <ins key={i}>{part.text}</ins>;
                    })}
                  </p>
                </div>
              )}
            </>
          )}

          {editing && (
            <section className="review-panel editor-panel">
              <h2 className="review-panel-title">{UI.edit}</h2>
              <textarea
                className="editor-textarea"
                rows={20}
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
              />
              <label className="field-label" style={{ marginTop: 12, display: "block" }} htmlFor="change-note">
                {UI.changeNote}
              </label>
              <input
                id="change-note"
                className="editor-input"
                value={editChangeNote}
                onChange={(e) => setEditChangeNote(e.target.value)}
              />

              {((currentVersion?.assets.length ?? 0) > 0 || newUploads.length > 0 || newLinks.length > 0) && (
                <div className="editor-files">
                  <div className="field-label">{UI.files}</div>
                  {(currentVersion?.assets ?? []).filter((a) => editKeep.has(a.id)).map((a) => (
                    <div key={a.id} className="editor-file-row">
                      {a.kind === "image"
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={signedUrls[a.storagePath ?? ""] ?? ""} alt="" className="editor-file-thumb" />
                        : <FileText size={14} aria-hidden />}
                      <span className="editor-file-name">{a.caption || (a.storagePath ? fileNameOf(a.storagePath) : a.url)}</span>
                      <button type="button" aria-label={UI.removeFile} onClick={() => setEditKeep((s) => { const n = new Set(s); n.delete(a.id); return n; })}>
                        <X size={14} aria-hidden />
                      </button>
                    </div>
                  ))}
                  {newUploads.map((u, i) => (
                    <div key={i} className="editor-file-row">
                      <Upload size={14} aria-hidden />
                      <input
                        placeholder="Felirat"
                        className="editor-caption-input"
                        value={u.caption}
                        onChange={(e) => setNewUploads((list) => list.map((x, j) => (j === i ? { ...x, caption: e.target.value } : x)))}
                      />
                      <button type="button" aria-label={UI.removeFile} onClick={() => setNewUploads((list) => list.filter((_, j) => j !== i))}>
                        <X size={14} aria-hidden />
                      </button>
                    </div>
                  ))}
                  {newLinks.map((l, i) => (
                    <div key={i} className="editor-file-row">
                      <Link2 size={14} aria-hidden />
                      <span className="editor-file-name">{l.caption || l.url}</span>
                      <button type="button" aria-label={UI.removeFile} onClick={() => setNewLinks((list) => list.filter((_, j) => j !== i))}>
                        <X size={14} aria-hidden />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {uploading.length > 0 && (
                <div className="editor-files">
                  {uploading.map((u) => (
                    <div key={u.id} className="editor-file-row">
                      <span className="editor-file-name">{u.name}</span>
                      <span className="upload-status">{u.status}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="editor-actions-row">
                <label className="btn">
                  {UI.addFile}
                  <input
                    type="file"
                    multiple
                    hidden
                    accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,application/pdf"
                    onChange={(e) => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = ""; }}
                  />
                </label>
                <button type="button" className="btn" onClick={() => setAddingLink(true)}>{UI.addLink}</button>
              </div>
              {addingLink && (
                <div className="editor-link-row">
                  <input placeholder="Link" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
                  <input placeholder="Felirat" value={linkCaption} onChange={(e) => setLinkCaption(e.target.value)} />
                  <button type="button" className="btn btn-sm" disabled={!isHttpUrl(linkUrl)} onClick={confirmAddLink}>{UI.addLink}</button>
                  <button type="button" className="btn ghost btn-sm" onClick={() => { setAddingLink(false); setLinkUrl(""); setLinkCaption(""); }}>{UI.cancel}</button>
                </div>
              )}

              {actionError && (
                <p className="review-error">
                  {actionError} <button type="button" className="btn btn-sm" onClick={() => router.refresh()}>frissítés</button>
                </p>
              )}

              <div className="editor-save-row">
                <button type="button" className="btn" disabled={isPending} onClick={() => setEditing(false)}>{UI.cancel}</button>
                <button type="button" className="btn primary" disabled={isPending || !editBody.trim() || uploading.length > 0} onClick={saveEdit}>
                  {UI.saveAsVersion}
                </button>
                <span className="editor-reset-warning">{UI.resetWarning}</span>
              </div>
            </section>
          )}

          {showLive && (
            <section className="review-panel">
              <h2 className="review-panel-title">Megjelent</h2>
              <button type="button" className="btn btn-sm" onClick={handleCopy}>{copied ? UI.copied : UI.copyText}</button>
              <div className="live-publish-row">
                <input placeholder="Link" value={publishUrl} onChange={(e) => setPublishUrl(e.target.value)} />
                <button
                  type="button"
                  className="btn primary btn-sm"
                  disabled={isPending || !isHttpUrl(publishUrl)}
                  onClick={() => run(() => publishContent(item.id, publishUrl.trim()))}
                >
                  Megjelent
                </button>
              </div>
              {item.externalUrl && (
                <div className="live-published-link">
                  {isHttpUrl(item.externalUrl)
                    ? <a href={item.externalUrl} target="_blank" rel="noopener noreferrer">{item.externalUrl}</a>
                    : <span>{item.externalUrl}</span>}
                </div>
              )}
              {item.externalUrl && (
                <div className="metrics-grid">
                  {METRIC_FIELDS.map((f) => (
                    <div key={f.key}>
                      <label className="field-label">{f.label}</label>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={metrics[f.key]}
                        onChange={(e) => setMetrics((m) => ({ ...m, [f.key]: e.target.value }))}
                      />
                    </div>
                  ))}
                  <button type="button" className="btn primary btn-sm" disabled={isPending} onClick={saveMetrics}>Metrikák mentése</button>
                </div>
              )}
            </section>
          )}
        </main>

        {/* Sidebar: action bar (sticky), version history, comments */}
        <aside className="review-side">
          {showActionBar && (
            <div className="review-actionbar-wrap">
              <div className="review-actionbar">
                {canReviewButtons && (
                  <>
                    <button
                      type="button"
                      className="actionbar-btn approve"
                      aria-pressed={myVerdict === "approve"}
                      disabled={isPending}
                      onClick={() => submitVerdict("approve")}
                    >
                      <Check size={16} aria-hidden="true" /> {VERDICT_ACTION.approve}
                    </button>
                    <button
                      type="button"
                      className="actionbar-btn changes"
                      aria-pressed={myVerdict === "changes"}
                      disabled={isPending}
                      onClick={() => { setReviewPanel((p) => (p === "changes" ? null : "changes")); setReviewComment(""); setActionError(null); }}
                    >
                      <PencilLine size={16} aria-hidden="true" /> {VERDICT_ACTION.changes}
                    </button>
                    <button
                      type="button"
                      className="actionbar-btn rewrite"
                      aria-pressed={myVerdict === "rewrite"}
                      disabled={isPending}
                      onClick={() => { setReviewPanel((p) => (p === "rewrite" ? null : "rewrite")); setReviewComment(""); setActionError(null); }}
                    >
                      <RotateCcw size={16} aria-hidden="true" /> {VERDICT_ACTION.rewrite}
                    </button>
                  </>
                )}
                {showOldVersionNotice && (
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => { setViewedId(item.currentVersionId); setShowDiff(false); }}
                  >
                    {`→ ${UI.version(currentVersion?.number ?? 0)}`}
                  </button>
                )}
                {canEditButton && (
                  <button type="button" className="actionbar-btn edit" disabled={isPending} onClick={openEditor}>
                    <Pencil size={16} aria-hidden="true" /> {UI.edit}
                  </button>
                )}
              </div>
              {reviewPanel && (
                <div className="review-comment-panel">
                  <label className="field-label" htmlFor="review-comment" style={{ display: "block" }}>{UI.commentLabel}</label>
                  <textarea
                    id="review-comment"
                    autoFocus
                    rows={3}
                    placeholder={UI.commentRequired}
                    value={reviewComment}
                    onChange={(e) => setReviewComment(e.target.value)}
                  />
                  {actionError && <p className="review-error">{actionError}</p>}
                  <div className="editor-actions-row">
                    <button type="button" className="btn" disabled={isPending} onClick={() => setReviewPanel(null)}>{UI.cancel}</button>
                    <button
                      type="button"
                      className="btn primary"
                      disabled={isPending || reviewComment.trim().length < 3}
                      onClick={() => submitVerdict(reviewPanel, reviewComment.trim())}
                    >
                      {reviewPanel === "changes" ? VERDICT_ACTION.changes : VERDICT_ACTION.rewrite}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <section className="review-panel">
            <h2 className="review-panel-title">{UI.versions}</h2>
            <ul className="version-list">
              {versions.map((v) => {
                const isCurrent = v.id === item.currentVersionId;
                const isLive = v.id === item.liveVersionId;
                const isViewed = v.id === viewed?.id;
                const authorLabel = AUTHOR_LABEL[v.authorType] ?? v.authorType;
                const authorName = v.authorName ?? v.authorApp ?? "";
                return (
                  <li key={v.id}>
                    <button
                      type="button"
                      className={cx("version-item", isViewed && "active")}
                      onClick={() => { setViewedId(v.id); setShowDiff(false); }}
                    >
                      <div className="version-item-head">
                        <span className="version-num">{UI.version(v.number)}</span>
                        {isCurrent && <span className="version-flag" aria-hidden>●</span>}
                        {isLive && <span className="version-flag live">{UI.live}</span>}
                      </div>
                      <div className="version-meta">
                        {authorLabel}{authorName ? ` · ${authorName}` : ""} · {new Date(v.createdAt).toLocaleDateString("hu-HU")}
                      </div>
                      {v.changeNote && <div className="version-note">{v.changeNote}</div>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          {versions.some((v) => v.reviews.length > 0) && (
            <section className="review-panel">
              <h2 className="review-panel-title">{UI.comments}</h2>
              {versions.filter((v) => v.reviews.length > 0).map((v) => (
                <div key={v.id} className="comment-group">
                  <div className="comment-group-head">{UI.version(v.number)}</div>
                  {v.reviews.map((r, i) => (
                    <div key={i} className="comment-item">
                      <div className="comment-head">
                        <span className="comment-author">{r.reviewerName}</span>
                        <span className={cx("comment-verdict", `verdict-${r.verdict}`)}>{VERDICT_LABEL[r.verdict as Verdict]}</span>
                        <span className="comment-date">{new Date(r.at).toLocaleDateString("hu-HU")}</span>
                      </div>
                      {r.comment && <p className="comment-text">{r.comment}</p>}
                    </div>
                  ))}
                </div>
              ))}
            </section>
          )}

          {userId != null && item.status !== "archived" && (
            <button
              type="button"
              className="archive-link"
              disabled={isPending}
              onClick={() => { if (confirm(`${UI.archive}?`)) run(() => archiveContent(item.id)); }}
            >
              {UI.archive}
            </button>
          )}
        </aside>
      </div>

      {lightboxSrc && (
        <div className="lightbox" role="dialog" aria-modal="true" onClick={() => setLightboxSrc(null)}>
          <button type="button" className="lightbox-close" aria-label={UI.cancel} onClick={() => setLightboxSrc(null)}>
            <X size={20} aria-hidden />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightboxSrc} alt="" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
