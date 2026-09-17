"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";
import { UI } from "@/lib/content/labels";
import {
  getContentReviewerOptions, saveContentReviewers, getMyDigestSetting, setMyDigestEnabled,
  type ReviewerOption,
} from "@/app/actions/content";

export function ReviewerSettings() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [options, setOptions] = useState<ReviewerOption[] | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
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
                disabled={saving || selected.length !== 2}
                className="btn primary"
                style={{ marginTop: 14, minHeight: 44 }}
              >
                {UI.saveReviewers}
              </button>
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
