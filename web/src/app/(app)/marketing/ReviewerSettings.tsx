"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";
import { UI, CATEGORY_LABEL } from "@/lib/content/labels";
import { CONTENT_CATEGORIES } from "@/lib/content/types";
import {
  getContentReviewerOptions, saveContentReviewers, getMyDigestSetting, setMyDigestEnabled,
  getContentApprovals, saveContentApprovals,
  type ReviewerOption,
} from "@/app/actions/content";

export function ReviewerSettings() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [options, setOptions] = useState<ReviewerOption[] | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [approvals, setApprovals] = useState<{ default: number; byCategory: Record<string, number> } | null>(null);
  const [approvalsSaving, setApprovalsSaving] = useState(false);
  const [approvalsError, setApprovalsError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [digest, setDigest] = useState<{ enabled: boolean; isReviewer: boolean } | null>(null);
  const [digestSaving, setDigestSaving] = useState(false);

  async function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next && options === null) {
      setLoading(true);
      const [opts, digestSetting] = await Promise.all([getContentReviewerOptions(), getMyDigestSetting()]);
      setOptions(opts);
      setSelected(opts.filter((o) => o.selected).map((o) => o.id));
      setApprovals(await getContentApprovals());
      setDigest(digestSetting);
      setLoading(false);
    }
  }

  async function toggleDigest() {
    if (!digest || digestSaving) return;
    const nextEnabled = !digest.enabled;
    setDigestSaving(true);
    const res = await setMyDigestEnabled(nextEnabled);
    if (res.ok) setDigest({ ...digest, enabled: nextEnabled });
    setDigestSaving(false);
  }

  function toggleReviewer(id: number) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
    setError(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    const res = await saveContentReviewers(selected);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    const opts = await getContentReviewerOptions();
    setOptions(opts);
    router.refresh();
  }

  return (
    <div className="panel" style={{ marginTop: 20 }}>
      <button
        onClick={toggleOpen}
        className="w-full flex items-center gap-2"
        style={{
          background: "transparent", border: "none", cursor: "pointer",
          padding: "14px 20px", minHeight: 44, textAlign: "left",
        }}
      >
        {open ? <ChevronDown className="size-4" style={{ color: "var(--fg-faint)" }} /> : <ChevronRight className="size-4" style={{ color: "var(--fg-faint)" }} />}
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--fg)" }}>{UI.reviewers}</span>
      </button>
      {open && (
        <div className="panel-pad" style={{ paddingTop: 0 }}>
          {loading || options === null ? (
            <div style={{ fontSize: 14, color: "var(--fg-mute)" }}>…</div>
          ) : (
            <>
              <div className="space-y-2">
                {options.map((o) => {
                  const checked = selected.includes(o.id);
                  return (
                    <label
                      key={o.id}
                      className="flex items-center gap-2.5"
                      style={{
                        minHeight: 44, padding: "6px 10px",
                        border: "1px solid var(--line-soft)", borderRadius: 8,
                        cursor: "pointer",
                        background: checked ? "var(--indigo-soft)" : "transparent",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleReviewer(o.id)}
                        style={{ width: 18, height: 18 }}
                      />
                      <span style={{ fontSize: 14, color: "var(--fg)" }}>{o.name}</span>
                      <span style={{ fontSize: 12, color: "var(--fg-faint)" }}>{o.email}</span>
                    </label>
                  );
                })}
              </div>
              {error && (
                <p style={{ fontSize: 13, color: "var(--coral)", marginTop: 10 }}>{error}</p>
              )}
              <button
                onClick={save}
                disabled={saving || selected.length < 1 || selected.length > 2}
                className="btn primary"
                style={{ marginTop: 14, minHeight: 44 }}
              >
                {UI.saveReviewers}
              </button>
              {approvals && (
                <div style={{ marginTop: 18, borderTop: "1px solid var(--line-soft)", paddingTop: 14 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--fg)" }}>{UI.approvalsSettings}</div>
                  <p style={{ fontSize: 13, color: "var(--fg-mute)", margin: "6px 0 10px", maxWidth: "60ch" }}>
                    {UI.approvalsWarning}
                  </p>
                  <div className="space-y-2">
                    {CONTENT_CATEGORIES.map((c) => (
                      <label key={c} className="flex items-center gap-2.5" style={{ minHeight: 44 }}>
                        <span style={{ fontSize: 14, color: "var(--fg)", minWidth: 140 }}>{CATEGORY_LABEL[c]}</span>
                        <select
                          value={approvals.byCategory[c] ?? approvals.default}
                          onChange={(e) =>
                            setApprovals({
                              ...approvals,
                              byCategory: { ...approvals.byCategory, [c]: Number(e.target.value) },
                            })
                          }
                          style={{ minHeight: 44, padding: "6px 10px", background: "var(--bg-raised)", border: "1px solid var(--line-soft)", borderRadius: 8, color: "var(--fg)" }}
                        >
                          <option value={1}>{UI.approvalsOne}</option>
                          <option value={2}>{UI.approvalsTwo}</option>
                        </select>
                      </label>
                    ))}
                  </div>
                  {approvalsError && <p style={{ fontSize: 13, color: "var(--coral)", marginTop: 8 }}>{approvalsError}</p>}
                  <button
                    className="btn"
                    style={{ marginTop: 12, minHeight: 44 }}
                    disabled={approvalsSaving}
                    onClick={async () => {
                      setApprovalsSaving(true);
                      setApprovalsError(null);
                      const byCategory = Object.fromEntries(
                        CONTENT_CATEGORIES.map((c) => [c, approvals.byCategory[c] ?? approvals.default]),
                      );
                      const res = await saveContentApprovals({ byCategory });
                      setApprovalsSaving(false);
                      if (!res.ok) setApprovalsError(res.error);
                      else router.refresh();
                    }}
                  >
                    {UI.saveApprovals}
                  </button>
                </div>
              )}
              {digest?.isReviewer && (
                <label
                  className="flex items-center gap-2.5"
                  style={{ minHeight: 44, marginTop: 16, cursor: digestSaving ? "default" : "pointer" }}
                >
                  <input
                    type="checkbox"
                    checked={digest.enabled}
                    disabled={digestSaving}
                    onChange={toggleDigest}
                    style={{ width: 18, height: 18 }}
                  />
                  <span style={{ fontSize: 14, color: "var(--fg)" }}>Napi e-mail összefoglaló (hétköznap 8:00)</span>
                </label>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
