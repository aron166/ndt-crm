"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { A } from "@/lib/assistant/labels";
import {
  addItemNote, askAssistant, draftTicket, fileTicket, openAssistant,
  type NoteView,
} from "@/app/actions/assistant";
import type { TicketDraft } from "@/lib/assistant/ticket";
import { PATCH_REPOS } from "@/lib/patchnotes/repos";

type Msg = { role: "user" | "assistant"; content: string };
type Tab = "ask" | "note" | "ticket";
type Filed = { url: string } | { fallbackUrl: string } | null;

const MAX_USER = 20;

const field: React.CSSProperties = {
  width: "100%", background: "var(--bg-raised)", border: "1px solid var(--line-soft)",
  borderRadius: 6, padding: "8px 10px", fontSize: 16, color: "var(--fg)", minHeight: 36,
};
const btn: React.CSSProperties = {
  minHeight: 36, padding: "0 14px", borderRadius: 6, fontSize: 14, fontWeight: 500, cursor: "pointer",
  background: "var(--mint-soft)", color: "var(--mint-fg)", border: "1px solid var(--mint-line)",
};
const btnQuiet: React.CSSProperties = {
  ...btn, background: "var(--bg-raised)", color: "var(--fg-mute)", border: "1px solid var(--line-soft)",
};
const pre: React.CSSProperties = { whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 14, lineHeight: 1.45 };
const errStyle: React.CSSProperties = { fontSize: 13, color: "var(--coral)" };

function dis(on: boolean): React.CSSProperties {
  return on ? { opacity: 0.5, cursor: "not-allowed" } : {};
}

export function AssistantDrawer({ open, itemId, onClose }: { open: boolean; itemId: number | null; onClose: () => void }) {
  const pathname = usePathname();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<Tab>("ask");
  const [configured, setConfigured] = useState(true);
  const [item, setItem] = useState<{ id: number; title: string } | null>(null);
  const [notes, setNotes] = useState<NoteView[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [askError, setAskError] = useState<string | null>(null);
  const [asking, startAsk] = useTransition();

  const [noteText, setNoteText] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  const [ticketText, setTicketText] = useState("");
  const [draft, setDraft] = useState<TicketDraft | null>(null);
  const [filed, setFiled] = useState<Filed>(null);
  const [ticketError, setTicketError] = useState<string | null>(null);
  const [drafting, startDraft] = useTransition();
  const [filing, startFile] = useTransition();

  // Load item context + notes on open and when the item changes.
  useEffect(() => {
    if (!open) return;
    let live = true;
    openAssistant({ itemId }).then((res) => {
      if (!live) return;
      if ("error" in res) { setLoadError(res.error); return; }
      setLoadError(null);
      setConfigured(res.configured);
      setItem(res.item);
      setNotes(res.notes);
    }).catch(() => live && setLoadError(A.genericError));
    return () => { live = false; };
  }, [open, itemId]);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const f = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ));
      if (f.length === 0) { e.preventDefault(); return; }
      const first = f[0], last = f[f.length - 1], cur = document.activeElement;
      const inside = dialogRef.current.contains(cur) && cur !== dialogRef.current;
      if (e.shiftKey && (!inside || cur === first)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (!inside || cur === last)) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); opener?.focus?.(); };
  }, [open, onClose]);

  const userCount = msgs.filter((m) => m.role === "user").length;
  const atLimit = userCount >= MAX_USER;
  const noAi = !configured || !!loadError;

  function send(text: string) {
    const t = text.trim();
    if (!t || atLimit || asking || noAi) return;
    const next: Msg[] = [...msgs, { role: "user", content: t }];
    setMsgs(next);
    setInput("");
    setAskError(null);
    startAsk(async () => {
      try {
        const res = await askAssistant({ pathname, itemId, messages: next });
        if ("error" in res) { setAskError(res.error); setMsgs(msgs); setInput(t); }
        else setMsgs([...next, { role: "assistant", content: res.reply }]);
      } catch { setAskError(A.genericError); setMsgs(msgs); setInput(t); }
    });
  }

  function saveNote() {
    if (itemId == null || !noteText.trim() || loadError) return;
    setNoteError(null);
    startSave(async () => {
      try {
        const res = await addItemNote({ itemId, body: noteText.trim() });
        if ("error" in res) setNoteError(res.error);
        else { setNotes((n) => [res.note, ...n]); setNoteText(""); }
      } catch { setNoteError(A.genericError); }
    });
  }

  function makeDraft() {
    const t = ticketText.trim();
    if (!t || noAi) return;
    setTicketError(null);
    setFiled(null);
    startDraft(async () => {
      try {
        const res = await draftTicket({ pathname, itemId, messages: [{ role: "user", content: t }] });
        if ("error" in res) setTicketError(res.error);
        else setDraft(res.draft);
      } catch { setTicketError(A.genericError); }
    });
  }

  function submitTicket() {
    if (!draft) return;
    setTicketError(null);
    startFile(async () => {
      try {
        const res = await fileTicket(draft);
        if ("error" in res) setTicketError(res.error);
        else setFiled("url" in res ? { url: res.url } : { fallbackUrl: res.fallbackUrl });
      } catch { setTicketError(A.genericError); }
    });
  }

  function patch(p: Partial<TicketDraft>) { setDraft((d) => (d ? { ...d, ...p } : d)); }

  const tabBtn = (id: Tab, label: string) => (
    <button
      type="button" role="tab" id={`assistant-tab-${id}`} aria-controls="assistant-panel" aria-selected={tab === id} onClick={() => setTab(id)}
      style={{
        flex: 1, minHeight: 36, fontSize: 14, fontWeight: 500, cursor: "pointer", background: "none",
        color: tab === id ? "var(--fg)" : "var(--fg-mute)", border: "none",
        borderBottom: `2px solid ${tab === id ? "var(--coral)" : "transparent"}`,
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ display: open ? "block" : "none" }}>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "var(--overlay)", zIndex: 90 }} />
      <div
        ref={dialogRef} role="dialog" aria-modal="true" aria-label={A.dialog} tabIndex={-1}
        style={{
          position: "fixed", top: 0, right: 0, bottom: 0, width: "min(420px, 100vw)", zIndex: 91,
          background: "var(--bg-page)", borderLeft: "1px solid var(--line-soft)", color: "var(--fg)",
          display: "flex", flexDirection: "column", outline: "none",
        }}
      >
        <div className="panel-pad" style={{ display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid var(--line-soft)" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: "var(--fg-faint)" }}>{A.dialog}</div>
            <div style={{ fontSize: 15, fontWeight: 600, overflowWrap: "anywhere" }}>
              {loadError ?? (itemId == null ? A.general : (item?.title ?? A.loading))}
            </div>
          </div>
          <button type="button" onClick={onClose} style={btnQuiet}>{A.close}</button>
        </div>

        <div role="tablist" style={{ display: "flex", borderBottom: "1px solid var(--line-soft)" }}>
          {tabBtn("ask", A.tabAsk)}{tabBtn("note", A.tabNote)}{tabBtn("ticket", A.tabTicket)}
        </div>

        <div id="assistant-panel" role="tabpanel" aria-labelledby={`assistant-tab-${tab}`} className="panel-pad" style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
          {!configured && !loadError && <p style={{ fontSize: 14, color: "var(--fg-mute)" }}>{A.notConfigured}</p>}
          {loadError && <p style={errStyle}>{loadError}</p>}

          {tab === "ask" && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <button type="button" disabled={noAi || atLimit || asking} onClick={() => send(A.quick)} style={{ ...btnQuiet, ...dis(noAi || atLimit || asking) }}>
                  {A.quick}
                </button>
                <span className="badge-ds" style={{ color: "var(--fg-mute)" }}>{A.counter(userCount, MAX_USER)}</span>
                {msgs.length > 0 && (
                  <button type="button" onClick={() => { setMsgs([]); setAskError(null); }} style={btnQuiet}>{A.reset}</button>
                )}
              </div>
              {msgs.map((m, i) => (
                <div key={i} className="panel-pad" style={{ background: m.role === "user" ? "var(--bg-raised)" : "transparent", border: "1px solid var(--line-soft)", borderRadius: 8 }}>
                  <div style={{ fontSize: 12, color: "var(--fg-faint)", marginBottom: 4 }}>{m.role === "user" ? A.you : A.assistant}</div>
                  <div style={pre}>{m.content}</div>
                </div>
              ))}
              {asking && <p style={{ fontSize: 13, color: "var(--fg-mute)" }}>{A.thinking}</p>}
              {askError && <p style={errStyle}>{askError}</p>}
              {atLimit && <p style={{ fontSize: 13, color: "var(--fg-mute)" }}>{A.limitHint}</p>}
            </>
          )}

          {tab === "note" && (itemId == null ? (
            <p style={{ fontSize: 14, color: "var(--fg-mute)" }}>{A.noteNeedItem}</p>
          ) : (
            <>
              <textarea
                aria-label={A.notePlaceholder} placeholder={A.notePlaceholder} rows={3}
                value={noteText} onChange={(e) => setNoteText(e.target.value)} style={{ ...field, resize: "vertical" }}
              />
              {noteError && <p style={errStyle}>{noteError}</p>}
              <div>
                <button type="button" disabled={saving || !noteText.trim() || !!loadError} onClick={saveNote} style={{ ...btn, ...dis(saving || !noteText.trim() || !!loadError) }}>
                  {A.noteSave}
                </button>
              </div>
              {notes.length === 0 && <p style={{ fontSize: 13, color: "var(--fg-faint)" }}>{A.noteEmpty}</p>}
              {notes.map((n) => (
                <div key={n.id} style={{ borderTop: "1px solid var(--line-soft)", paddingTop: 8 }}>
                  <div style={{ fontSize: 12, color: "var(--fg-faint)", marginBottom: 4 }}>
                    {n.author} {new Date(n.createdAt).toLocaleString("hu-HU", { timeZone: "Europe/Budapest" })}
                  </div>
                  <div style={pre}>{n.body}</div>
                </div>
              ))}
            </>
          ))}

          {tab === "ticket" && (
            <>
              <label style={{ fontSize: 13, color: "var(--fg-mute)" }} htmlFor="assistant-ticket-text">{A.ticketPrompt}</label>
              <textarea
                id="assistant-ticket-text" rows={3} maxLength={2000} value={ticketText}
                onChange={(e) => setTicketText(e.target.value)} style={{ ...field, resize: "vertical" }}
              />
              <div>
                <button type="button" disabled={noAi || drafting || !ticketText.trim()} onClick={makeDraft} style={{ ...btn, ...dis(noAi || drafting || !ticketText.trim()) }}>
                  {drafting ? A.thinking : A.ticketDraft}
                </button>
              </div>
              {draft && (
                <div className="panel-pad" style={{ border: "1px solid var(--line-soft)", borderRadius: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                  <label style={{ fontSize: 12, color: "var(--fg-faint)" }}>{A.ticketTitle}
                    <input value={draft.title} onChange={(e) => patch({ title: e.target.value })} style={field} />
                  </label>
                  <label style={{ fontSize: 12, color: "var(--fg-faint)" }}>{A.ticketBody}
                    <textarea rows={6} value={draft.body} onChange={(e) => patch({ body: e.target.value })} style={{ ...field, resize: "vertical" }} />
                  </label>
                  <label style={{ fontSize: 12, color: "var(--fg-faint)" }}>{A.ticketLabel}
                    <select value={draft.label} onChange={(e) => patch({ label: e.target.value as TicketDraft["label"] })} style={field}>
                      <option value="bug">{A.labelBug}</option>
                      <option value="backlog">{A.labelBacklog}</option>
                    </select>
                  </label>
                  <label style={{ fontSize: 12, color: "var(--fg-faint)" }}>{A.ticketRepo}
                    <select value={draft.repo} onChange={(e) => patch({ repo: e.target.value as TicketDraft["repo"] })} style={field}>
                      {PATCH_REPOS.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </label>
                  <div>
                    <button type="button" disabled={filing || !!filed || !draft.title.trim()} onClick={submitTicket} style={{ ...btn, ...dis(filing || !!filed || !draft.title.trim()) }}>
                      {A.ticketFile}
                    </button>
                  </div>
                </div>
              )}
              {filed && "url" in filed && (
                <p style={{ fontSize: 14 }}>{A.ticketDone}{" "}
                  <a href={filed.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--mint-fg)", overflowWrap: "anywhere" }}>{A.ticketOpen}</a>
                </p>
              )}
              {filed && "fallbackUrl" in filed && (
                <p style={{ fontSize: 14 }}>{A.ticketFallback}{" "}
                  <a href={filed.fallbackUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--mint-fg)", overflowWrap: "anywhere" }}>{A.ticketOpen}</a>
                </p>
              )}
              {ticketError && <p style={errStyle}>{ticketError}</p>}
            </>
          )}
        </div>

        {tab === "ask" && (
          <form
            onSubmit={(e) => { e.preventDefault(); send(input); }}
            style={{ display: "flex", gap: 8, padding: "10px 16px calc(10px + env(safe-area-inset-bottom))", borderTop: "1px solid var(--line-soft)" }}
          >
            <input
              aria-label={A.askPlaceholder} placeholder={A.askPlaceholder} value={input} maxLength={2000}
              onChange={(e) => setInput(e.target.value)} disabled={noAi || atLimit} style={{ ...field, flex: 1, ...dis(noAi || atLimit) }}
            />
            <button type="submit" disabled={noAi || atLimit || asking || !input.trim()} style={{ ...btn, ...dis(noAi || atLimit || asking || !input.trim()) }}>
              {A.send}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
