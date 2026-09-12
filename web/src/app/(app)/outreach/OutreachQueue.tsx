"use client";

// ⚠️ Every Hungarian string on this page is a PROPOSAL, not final copy. It was
// reviewed for idiom (translating-english-to-hungarian) but not signed off by
// Áron or Péter — the consent/unsubscribe footer above all, which is the one
// line a recipient can hold us to. Replace before the first real campaign.

import { useState } from "react";
import { FormField } from "@/components/ui/FormField";
import {
  listDrafts,
  updateDraft,
  approveDraft,
  approveAll,
  sendDraft,
  getDraftBody,
  saveOutreachSettings,
  type DraftListRow,
  type OutreachSettings,
} from "@/app/actions/email-drafts";
import { DRAFT_STATUSES, MAX_STEP, canEdit, canApprove, canSend, type DraftStatus } from "@/lib/outreach/drafts";

// ⚠️ PLACEHOLDER consent line. Áron owes the real wording — this one is a
// starting point, not legal text, and it goes out on every send once saved.
const FOOTER_PLACEHOLDER =
  "⚠️ Ezt a levelet üzleti ajánlatként küldtük a nyilvánosan elérhető céges elérhetőségre. " +
  "Ha nem szeretne több levelet kapni tőlünk, válaszoljon annyit: „leiratkozás”, és töröljük a listánkról.";

const STATUS_LABEL: Record<DraftStatus, string> = {
  draft: "Piszkozat",
  approved: "Jóváhagyva",
  sending: "Küldés alatt",
  sent: "Elküldve",
  failed: "Sikertelen",
  replied: "Válaszolt",
};

const STATUS_TONE: Record<DraftStatus, string> = {
  draft: "var(--fg-mute)",
  approved: "var(--indigo)",
  sending: "var(--indigo)",
  sent: "var(--mint)",
  failed: "var(--coral)",
  replied: "var(--sky)",
};

function StatusBadge({ status }: { status: DraftStatus }) {
  const color = STATUS_TONE[status];
  return (
    <span
      style={{
        fontSize: 12, fontWeight: 500, color, padding: "2px 8px", borderRadius: 999,
        border: `1px solid ${color}`, background: "var(--bg-raised)", whiteSpace: "nowrap",
      }}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

export default function OutreachQueue({
  initialDrafts,
  campaigns,
  initialSettings,
}: {
  initialDrafts: DraftListRow[];
  campaigns: string[];
  initialSettings: OutreachSettings;
}) {
  const [drafts, setDrafts] = useState<DraftListRow[]>(initialDrafts);
  const [truncated, setTruncated] = useState(initialDrafts.length >= 200);
  const [loading, setLoading] = useState(false);
  const [campaignFilter, setCampaignFilter] = useState("");
  const [stepFilter, setStepFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [drafted, setDrafted] = useState<Record<number, { subject: string; body: string }>>({});
  const [bodyLoading, setBodyLoading] = useState<Record<number, boolean>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [approvingAll, setApprovingAll] = useState(false);
  const [rowError, setRowError] = useState<Record<number, string>>({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [replyTo, setReplyTo] = useState(initialSettings.replyTo ?? "");
  const [footer, setFooter] = useState(initialSettings.footer ?? "");
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  async function refetch(next: { campaign?: string; step?: string; status?: string }) {
    setLoading(true);
    try {
      const res = await listDrafts({
        campaign: next.campaign || undefined,
        step: next.step ? parseInt(next.step, 10) : undefined,
        status: next.status || undefined,
      });
      setDrafts(res.drafts);
      setTruncated(res.truncated);
    } finally {
      setLoading(false);
    }
  }

  /** Re-fetch under the filters currently on screen — the server is the
   * authority on status, so this is what "show me what really happened"
   * means after a send or a bulk approve. */
  function refetchCurrent() {
    return refetch({ campaign: campaignFilter, step: stepFilter, status: statusFilter });
  }

  function patchRow(id: number, patch: Partial<DraftListRow>) {
    setDrafts((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function toggleExpand(row: DraftListRow) {
    if (expandedId === row.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(row.id);
    if (drafted[row.id]) return; // body already fetched once, reuse it
    setBodyLoading((b) => ({ ...b, [row.id]: true }));
    getDraftBody(row.id).then((res) => {
      setBodyLoading((b) => ({ ...b, [row.id]: false }));
      if (!res.ok) {
        setRowError((e) => ({ ...e, [row.id]: res.error }));
        return;
      }
      setDrafted((d) => ({ ...d, [row.id]: { subject: d[row.id]?.subject ?? row.subject, body: res.body } }));
    });
  }

  async function onSave(row: DraftListRow) {
    const edit = drafted[row.id];
    if (!edit) return;
    setBusyId(row.id);
    setRowError((e) => ({ ...e, [row.id]: "" }));
    const res = await updateDraft(row.id, edit);
    setBusyId(null);
    if (!res.ok) {
      setRowError((e) => ({ ...e, [row.id]: res.error }));
      return;
    }
    patchRow(row.id, { subject: edit.subject });
  }

  async function onApprove(row: DraftListRow) {
    setBusyId(row.id);
    setRowError((e) => ({ ...e, [row.id]: "" }));
    const res = await approveDraft(row.id);
    setBusyId(null);
    if (!res.ok) {
      setRowError((e) => ({ ...e, [row.id]: res.error }));
      return;
    }
    patchRow(row.id, { status: "approved" });
  }

  async function onSend(row: DraftListRow) {
    setBusyId(row.id);
    setRowError((e) => ({ ...e, [row.id]: "" }));
    const res = await sendDraft(row.id);
    setBusyId(null);
    if (!res.ok) {
      // sendDraft's {ok:false} covers a lot more than "the email failed to
      // send": not found, wrong state, already claimed by another click,
      // missing unsubscribe footer, no address — none of those means the
      // row is actually `failed`, and blindly patching it to `failed` here
      // would re-enable Küldés (canSend("failed") === true) on a row that
      // may still be in flight. Only the server knows the true status
      // (draft/failed/still `sending`/sent), so show the message and
      // refetch instead of guessing — cheap, and always correct.
      setRowError((e) => ({ ...e, [row.id]: res.error }));
      await refetchCurrent();
      return;
    }
    patchRow(row.id, { status: "sent", lastError: null });
  }

  async function onApproveAll() {
    if (!campaignFilter) return;
    const step = stepFilter ? parseInt(stepFilter, 10) : undefined;
    const preview = await approveAll(campaignFilter, step, { dryRun: true });
    if (!preview.ok) return;
    if (preview.count === 0) {
      window.alert("Nincs jóváhagyható piszkozat ebben a kampányban.");
      return;
    }
    if (!window.confirm(`${preview.count} piszkozat jóváhagyása?`)) return;

    setApprovingAll(true);
    const res = await approveAll(campaignFilter, step);
    setApprovingAll(false);
    if (!res.ok) return;
    await refetchCurrent();
  }

  async function onSaveSettings() {
    setSettingsSaving(true);
    setSettingsError(null);
    const res = await saveOutreachSettings({ replyTo, footer });
    setSettingsSaving(false);
    if (!res.ok) setSettingsError(res.error);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="page-head">
        <div>
          <h1 className="page-title">Outreach piszkozatok</h1>
          <p className="page-sub">Kampányonként megírt emailek jóváhagyása és küldése</p>
        </div>
        <button
          onClick={() => setSettingsOpen((v) => !v)}
          style={{
            fontSize: 14, color: "var(--fg-mute)", background: "var(--bg-raised)",
            border: "1px solid var(--line-soft)", borderRadius: 8, padding: "8px 14px", cursor: "pointer",
          }}
        >
          {settingsOpen ? "Beállítások bezárása" : "Beállítások"}
        </button>
      </div>

      {settingsOpen && (
        <div className="panel panel-pad" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <FormField label="Válaszcím (reply-to)" hint="Ide érkeznek a válaszok. Hagyd üresen, ha nem kell.">
            <input
              className="input-ds"
              type="email"
              value={replyTo}
              onChange={(e) => setReplyTo(e.target.value)}
              placeholder="pl. sales@ceged.hu"
              style={{ width: "100%", fontSize: 14, color: "var(--fg)", background: "var(--bg-raised)", border: "1px solid var(--line-soft)", borderRadius: 8, padding: "8px 10px" }}
            />
          </FormField>
          <FormField label="Lábléc (leiratkozási és jogi közlemény) ⚠️" full>
            <textarea
              className="input-ds"
              value={footer}
              onChange={(e) => setFooter(e.target.value)}
              rows={2}
              placeholder={FOOTER_PLACEHOLDER}
              style={{ width: "100%", fontSize: 14, color: "var(--fg)", background: "var(--bg-raised)", border: "1px solid var(--line-soft)", borderRadius: 8, padding: "8px 10px", resize: "vertical" }}
            />
          </FormField>
          <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 12 }}>
            <button
              onClick={onSaveSettings}
              disabled={settingsSaving}
              style={{
                fontSize: 14, fontWeight: 500, color: "var(--indigo)", background: "var(--indigo-soft)",
                border: "1px solid var(--indigo-line)", borderRadius: 8, padding: "8px 16px",
                cursor: settingsSaving ? "default" : "pointer", opacity: settingsSaving ? 0.5 : 1,
              }}
            >
              {settingsSaving ? "Mentés…" : "Mentés"}
            </button>
            {settingsError && <span style={{ fontSize: 14, color: "var(--coral)" }}>{settingsError}</span>}
          </div>
        </div>
      )}

      <div className="panel panel-pad" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
        <select
          className="input-ds"
          value={campaignFilter}
          onChange={(e) => {
            const v = e.target.value;
            setCampaignFilter(v);
            refetch({ campaign: v, step: stepFilter, status: statusFilter });
          }}
          style={{ fontSize: 14, color: "var(--fg-soft)", background: "var(--bg-raised)", border: "1px solid var(--line-soft)", borderRadius: 8, padding: "7px 10px" }}
        >
          <option value="">Minden kampány</option>
          {campaigns.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select
          className="input-ds"
          value={stepFilter}
          onChange={(e) => {
            const v = e.target.value;
            setStepFilter(v);
            refetch({ campaign: campaignFilter, step: v, status: statusFilter });
          }}
          style={{ fontSize: 14, color: "var(--fg-soft)", background: "var(--bg-raised)", border: "1px solid var(--line-soft)", borderRadius: 8, padding: "7px 10px" }}
        >
          <option value="">Minden lépés</option>
          {Array.from({ length: MAX_STEP }, (_, i) => i + 1).map((s) => (
            <option key={s} value={s}>{s}. lépés</option>
          ))}
        </select>
        <select
          className="input-ds"
          value={statusFilter}
          onChange={(e) => {
            const v = e.target.value;
            setStatusFilter(v);
            refetch({ campaign: campaignFilter, step: stepFilter, status: v });
          }}
          style={{ fontSize: 14, color: "var(--fg-soft)", background: "var(--bg-raised)", border: "1px solid var(--line-soft)", borderRadius: 8, padding: "7px 10px" }}
        >
          <option value="">Minden állapot</option>
          {DRAFT_STATUSES.map((s) => (
            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
          ))}
        </select>

        <div style={{ flex: 1 }} />

        <button
          onClick={onApproveAll}
          disabled={!campaignFilter || approvingAll}
          title={!campaignFilter ? "Válassz kampányt a szűrőben" : undefined}
          style={{
            fontSize: 14, fontWeight: 500, color: "var(--indigo)", background: "var(--indigo-soft)",
            border: "1px solid var(--indigo-line)", borderRadius: 8, padding: "8px 16px",
            cursor: !campaignFilter || approvingAll ? "default" : "pointer",
            opacity: !campaignFilter || approvingAll ? 0.5 : 1,
          }}
        >
          {approvingAll ? "Jóváhagyás…" : "Összes jóváhagyása"}
        </button>
      </div>

      {truncated && (
        <div className="panel panel-pad" style={{ fontSize: 14, color: "var(--fg-mute)", background: "var(--bg-raised)" }}>
          Csak az első 200 piszkozat látszik ennél a szűrésnél — szűrj tovább (kampány, lépés, állapot) a többi megtekintéséhez.
        </div>
      )}

      {loading ? (
        <div className="panel panel-pad" style={{ fontSize: 14, color: "var(--fg-faint)", textAlign: "center" }}>
          Betöltés…
        </div>
      ) : drafts.length === 0 ? (
        <div className="panel panel-pad" style={{ fontSize: 14, color: "var(--fg-faint)", textAlign: "center" }}>
          A szűrőnek egyetlen piszkozat sem felel meg
        </div>
      ) : (
        <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
          {drafts.map((row, i) => {
            const expanded = expandedId === row.id;
            const edit = drafted[row.id];
            const bodyIsLoading = !!bodyLoading[row.id];
            const editable = canEdit(row.status);
            const busy = busyId === row.id;
            return (
              <div key={row.id} style={{ borderTop: i === 0 ? "none" : "1px solid var(--line-soft)" }}>
                <div
                  onClick={() => toggleExpand(row)}
                  className="tbl-row"
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", cursor: "pointer" }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: "var(--fg)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {row.companyName}
                      {row.personName && <span style={{ color: "var(--fg-faint)" }}> · {row.personName}</span>}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--fg-faint)", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {row.campaign} · {row.step}. lépés · {row.subject}
                    </div>
                  </div>
                  <StatusBadge status={row.status} />
                </div>

                {row.status === "failed" && row.lastError && (
                  <div style={{ padding: "0 16px 10px", fontSize: 14, color: "var(--coral)" }}>
                    Küldési hiba: {row.lastError}
                  </div>
                )}

                {expanded && (
                  <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                    <FormField label="Tárgy">
                      <input
                        className="input-ds"
                        value={edit?.subject ?? row.subject}
                        disabled={!editable}
                        onChange={(e) =>
                          setDrafted((d) => ({ ...d, [row.id]: { subject: e.target.value, body: d[row.id]?.body ?? "" } }))
                        }
                        style={{
                          width: "100%", fontSize: 14, color: "var(--fg)", background: "var(--bg-raised)",
                          border: "1px solid var(--line-soft)", borderRadius: 8, padding: "8px 10px",
                          opacity: editable ? 1 : 0.6,
                        }}
                      />
                    </FormField>
                    <FormField label="Szöveg">
                      {bodyIsLoading ? (
                        <div style={{ fontSize: 14, color: "var(--fg-faint)", padding: "8px 10px" }}>Betöltés…</div>
                      ) : (
                        <textarea
                          className="input-ds"
                          value={edit?.body ?? ""}
                          disabled={!editable}
                          rows={6}
                          onChange={(e) =>
                            setDrafted((d) => ({ ...d, [row.id]: { subject: d[row.id]?.subject ?? row.subject, body: e.target.value } }))
                          }
                          style={{
                            width: "100%", fontSize: 14, color: "var(--fg)", background: "var(--bg-raised)",
                            border: "1px solid var(--line-soft)", borderRadius: 8, padding: "8px 10px", resize: "vertical",
                            opacity: editable ? 1 : 0.6,
                          }}
                        />
                      )}
                    </FormField>

                    {rowError[row.id] && (
                      <div style={{ fontSize: 14, color: "var(--coral)" }}>{rowError[row.id]}</div>
                    )}

                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => onSave(row)}
                        disabled={!editable || busy || bodyIsLoading}
                        style={{
                          fontSize: 14, color: "var(--fg-soft)", background: "var(--bg-raised)",
                          border: "1px solid var(--line-soft)", borderRadius: 8, padding: "8px 14px",
                          cursor: !editable || busy || bodyIsLoading ? "default" : "pointer",
                          opacity: !editable || busy || bodyIsLoading ? 0.5 : 1,
                        }}
                      >
                        Mentés
                      </button>
                      <button
                        onClick={() => onApprove(row)}
                        disabled={!canApprove(row.status) || busy}
                        style={{
                          fontSize: 14, fontWeight: 500, color: "var(--indigo)", background: "var(--indigo-soft)",
                          border: "1px solid var(--indigo-line)", borderRadius: 8, padding: "8px 14px",
                          cursor: !canApprove(row.status) || busy ? "default" : "pointer",
                          opacity: !canApprove(row.status) || busy ? 0.5 : 1,
                        }}
                      >
                        Jóváhagyás
                      </button>
                      <button
                        onClick={() => onSend(row)}
                        disabled={!canSend(row.status) || busy}
                        style={{
                          fontSize: 14, fontWeight: 600, color: "var(--mint)", background: "var(--mint-soft)",
                          border: "1px solid oklch(0.80 0.13 165 / 0.35)", borderRadius: 8, padding: "8px 14px",
                          cursor: !canSend(row.status) || busy ? "default" : "pointer",
                          opacity: !canSend(row.status) || busy ? 0.5 : 1,
                        }}
                      >
                        Küldés
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
