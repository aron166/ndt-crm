"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";
import k from "@/components/astryx/page.module.css";
import s from "./marketing.module.css";
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
    <div className={k.card} style={{ marginTop: 20 }}>
      <button
        onClick={toggleOpen}
        className={s.sectionToggle}
      >
        {open ? <ChevronDown className="size-4" style={{ color: "var(--ui-text-muted)" }} /> : <ChevronRight className="size-4" style={{ color: "var(--ui-text-muted)" }} />}
        <span className={k.strong}>{UI.reviewers}</span>
      </button>
      {open && (
        <div className={s.settingsBody}>
          {loading || options === null ? (
            <div className={k.muted}>…</div>
          ) : (
            <>
              <div className={s.stackSm}>
                {options.map((o) => {
                  const checked = selected.includes(o.id);
                  return (
                    <label
                      key={o.id}
                      className={s.optionRow}
                      data-checked={checked}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleReviewer(o.id)}
                        className={s.check}
                      />
                      <span className={k.strong}>{o.name}</span>
                      <span className={k.muted}>{o.email}</span>
                    </label>
                  );
                })}
              </div>
              {error && (
                <p className={k.muted} style={{ color: "var(--coral)", marginTop: 10 }}>{error}</p>
              )}
              <button
                onClick={save}
                disabled={saving || selected.length < 1 || selected.length > 2}
                className={`${k.btn} ${k.btnPrimary}`}
                style={{ marginTop: 14 }}
              >
                {UI.saveReviewers}
              </button>
              {approvals && (
                <div style={{ marginTop: 18, borderTop: "1px solid var(--ui-border)", paddingTop: 14 }}>
                  <div className={k.strong}>{UI.approvalsSettings}</div>
                  <p className={k.muted} style={{ margin: "6px 0 10px", maxWidth: "60ch" }}>
                    {UI.approvalsWarning}
                  </p>
                  <div className={s.stackSm}>
                    {CONTENT_CATEGORIES.map((c) => (
                      <label key={c} className={s.labelRow}>
                        <span className={k.strong} style={{ minWidth: 140 }}>{CATEGORY_LABEL[c]}</span>
                        <select
                          value={approvals.byCategory[c] ?? approvals.default}
                          onChange={(e) =>
                            setApprovals({
                              ...approvals,
                              byCategory: { ...approvals.byCategory, [c]: Number(e.target.value) },
                            })
                          }
                          className={s.field}
                        >
                          <option value={1}>{UI.approvalsOne}</option>
                          <option value={2}>{UI.approvalsTwo}</option>
                        </select>
                      </label>
                    ))}
                  </div>
                  {approvalsError && <p className={k.muted} style={{ color: "var(--coral)", marginTop: 8 }}>{approvalsError}</p>}
                  <button
                    className={k.btn}
                    style={{ marginTop: 12 }}
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
                  className={s.labelRow}
                  style={{ marginTop: 16, cursor: digestSaving ? "default" : "pointer" }}
                >
                  <input
                    type="checkbox"
                    checked={digest.enabled}
                    disabled={digestSaving}
                    onChange={toggleDigest}
                    className={s.check}
                  />
                  <span className={k.strong}>Napi e-mail összefoglaló (hétköznap 8:00)</span>
                </label>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
