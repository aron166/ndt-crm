"use client";

import { Fragment, memo, useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, Bug, CheckCircle, ExternalLink, Gavel, Inbox, Scale, StickyNote, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { A } from "@/lib/assistant/labels";
import {
  addItemNote, deleteConversation, executeAction, getConversation, openAssistant, whatsWaiting,
  type NoteView, type WaitingView,
} from "@/app/actions/assistant";
import type { ActionProposal } from "@/lib/assistant/actions";
import type { ActionCard, ChatEvent, ChatRequest, ConversationSummary, ConversationView } from "@/lib/assistant/chat-types";
import { VERDICT_ACTION } from "@/lib/content/labels";
import { REVIEW_REASON_LABEL } from "@/lib/content/reasons";

type Msg = {
  role: "user" | "assistant";
  content: string;
  actions?: ActionCard[];
  /** Streaming only: each delta is its own fading span. */
  deltas?: string[];
  streaming?: boolean;
  status?: string;
};
type Tab = "chat" | "notes";
type CardState = {
  phase: "idle" | "running" | "done" | "dismissed";
  error?: string;
  message?: string;
  state?: string;
  href?: string;
  waiting?: WaitingView;
};

const LS_KEY = "assistant.conversationId";
const lsGet = (): number | null => {
  try { const n = Number(localStorage.getItem(LS_KEY)); return Number.isInteger(n) && n > 0 ? n : null; } catch { return null; }
};
const lsSet = (id: number | null) => {
  try { if (id == null) localStorage.removeItem(LS_KEY); else localStorage.setItem(LS_KEY, String(id)); } catch { /* storage unavailable */ }
};

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
const btnPrimary: React.CSSProperties = {
  ...btn, background: "var(--mint)", color: "var(--fg-on-accent)", border: "1px solid var(--mint)", fontWeight: 600,
};
const chip: React.CSSProperties = {
  minHeight: 36, padding: "0 14px", borderRadius: 18, fontSize: 14, cursor: "pointer",
  background: "var(--bg-raised)", color: "var(--fg)", border: "1px solid var(--line)",
};
const CARD_ICON: Record<ActionProposal["type"], LucideIcon> = {
  open_item: ExternalLink, navigate: ArrowRight, waiting: Inbox, review: CheckCircle,
  answer_decision: Gavel, create_decision: Scale, note: StickyNote, ticket: Bug, none: StickyNote,
};
const errStyle: React.CSSProperties = { fontSize: 13, color: "var(--coral)" };
const linkStyle: React.CSSProperties = { color: "var(--mint-fg)", overflowWrap: "anywhere" };
const small: React.CSSProperties = { fontSize: 12, color: "var(--fg-faint)" };

function proposalRows(p: ActionProposal): [string, string][] {
  switch (p.type) {
    case "review": return [
      [A.fVerdict, VERDICT_ACTION[p.verdict]],
      ...(p.comment ? [[A.fComment, p.comment]] as [string, string][] : []),
      ...(p.reason ? [[A.fReason, REVIEW_REASON_LABEL[p.reason]]] as [string, string][] : []),
    ];
    case "answer_decision": return [[A.fAnswer, p.answer]];
    case "create_decision": return [
      [A.fQuestion, p.question],
      [A.fContext, p.context],
      [A.fOptions, p.options.map((o, i) => `${i + 1}. ${o}`).join("\n")],
      ...(p.recommendation ? [[A.fRecommendation, p.recommendation]] as [string, string][] : []),
      ...(p.deadline ? [[A.fDeadline, p.deadline]] as [string, string][] : []),
      [A.fDecidedBy, A.forWhom[p.decidedBy] ?? p.decidedBy],
    ];
    case "note": return [[A.fItem, `#${p.itemId}`], [A.fBody, p.body]];
    case "ticket": return [
      [A.fTitle, p.draft.title],
      [A.fLabel, p.draft.label === "bug" ? A.labelBug : A.labelBacklog],
      [A.fBody, p.draft.body],
    ];
    case "open_item": return [[A.fItem, `#${p.itemId}`]];
    case "navigate": return [[A.fPath, p.path]];
    case "waiting":
    case "none": return [];
  }
}

// ---- answer rendering (no dangerouslySetInnerHTML) ----

const INLINE_RE = /(\*\*[^*]+\*\*|\/(?:marketing[\w/?=&#-]*|patchnotes|reports\/weekly))/g;

function Inline({ text, bold }: { text: string; bold?: boolean }) {
  const parts = text.split(INLINE_RE);
  return (
    <>
      {parts.map((part, i) => {
        if (!part) return null;
        if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return <strong key={i}>{part.slice(2, -2)}</strong>;
        if (i % 2 === 1) { // odd indices are the captured bold/path matches
          const trail = /[.,;:)]+$/.exec(part)?.[0] ?? "";
          const path = trail ? part.slice(0, -trail.length) : part;
          return <Fragment key={i}><Link href={path} style={linkStyle}>{path}</Link>{trail}</Fragment>;
        }
        return <Fragment key={i}>{bold ? <strong>{part}</strong> : part}</Fragment>;
      })}
    </>
  );
}

const Answer = memo(function Answer({ text }: { text: string }) {
  const lines = text.split("\n");
  const out: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = (k: number) => {
    if (!list.length) return;
    out.push(<ul key={`u${k}`} style={{ margin: "4px 0", paddingLeft: 18 }}>{list.map((l, i) => <li key={i}><Inline text={l} /></li>)}</ul>);
    list = [];
  };
  let first = true;
  lines.forEach((line, i) => {
    if (line.startsWith("- ")) { list.push(line.slice(2)); return; }
    flush(i);
    if (!line.trim()) { out.push(<div key={i} style={{ height: 6 }} />); return; }
    out.push(<div key={i}><Inline text={line} bold={first} /></div>);
    first = false;
  });
  flush(lines.length);
  return <div style={{ fontSize: 14, lineHeight: 1.45, overflowWrap: "anywhere" }}>{out}</div>;
});

function turnsToMsgs(c: ConversationView): Msg[] {
  return c.messages.map((t) => (t.role === "user" ? { role: "user", content: t.content } : { role: "assistant", content: t.content, actions: t.actions }));
}

const budapestDate = (iso: string) => new Date(iso).toLocaleDateString("hu-HU", { timeZone: "Europe/Budapest" });

function WaitingList({ w }: { w: WaitingView }) {
  if (w.items.length === 0 && w.decisions.length === 0) return <p role="status" style={{ fontSize: 14, color: "var(--fg-mute)", margin: 0 }}>{A.nothingWaiting}</p>;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {w.items.length > 0 && (
        <div>
          <div style={small}>{A.waitingItems}</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.5 }}>
            {w.items.map((i) => (
              <li key={i.id}>
                <Link href={i.href} style={linkStyle}>{i.title}</Link>
                {i.days != null && <span style={{ color: "var(--fg-faint)" }}> {A.daysAgo(i.days)}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {w.decisions.length > 0 && (
        <div>
          <div style={small}>{A.waitingDecisions}</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.5 }}>
            {w.decisions.map((d) => (
              <li key={d.checkId}>
                <Link href={d.href} style={linkStyle}>{d.question}</Link>
                <span style={{ color: "var(--fg-faint)" }}>
                  {" "}{A.fDecidedBy}: {A.forWhom[d.forWhom] ?? d.forWhom}
                  {d.deadline ? `, ${A.fDeadline}: ${d.deadline}` : ""}, {A.daysAgo(d.days)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Card({ card, st, onRun, onDismiss, locked }: { card: ActionCard; st: CardState; onRun: () => void; onDismiss: () => void; locked: boolean }) {
  if (st.phase === "dismissed") return null;
  const rows = proposalRows(card.proposal);
  const executed = !!card.executedAt;
  const finished = st.phase === "done" || executed;
  const running = st.phase === "running";
  const Icon = CARD_ICON[card.proposal.type];
  const external = st.href?.startsWith("http");
  return (
    <div style={{ border: "1px solid var(--line-soft)", background: "var(--bg-raised)", borderRadius: 8, padding: 10, display: "grid", gap: 6 }}>
      <div style={{ fontSize: 14, fontWeight: 600, display: "flex", gap: 8, alignItems: "flex-start" }}>
        <Icon size={16} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2, color: "var(--mint-fg)" }} />
        <span>{card.summary}</span>
      </div>
      {rows.map(([k, v]) => (
        <div key={k} style={{ fontSize: 13 }}>
          <span style={small}>{k}: </span><span style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{v}</span>
        </div>
      ))}
      {st.waiting && <WaitingList w={st.waiting} />}
      {st.message && <p role="status" style={{ margin: 0, fontSize: 13, color: "var(--mint-fg)" }}>{st.message}</p>}
      {st.state && <div style={{ fontSize: 13 }}><span style={small}>{A.newState}: </span>{st.state}</div>}
      {st.href && (external
        ? <a href={st.href} target="_blank" rel="noopener noreferrer" style={linkStyle}>{A.open}</a>
        : <Link href={st.href} style={linkStyle}>{A.open}</Link>)}
      {st.error && <p role="alert" style={{ ...errStyle, margin: 0 }}>{st.error}</p>}
      {executed && st.phase !== "done" && <p role="status" style={{ margin: 0, fontSize: 13, color: "var(--mint-fg)" }}>{A.executed}</p>}
      {!finished && (
        <div style={{ display: "flex", gap: 8 }}>
          {/* locked while a reply streams: the route appends to the stored turns at the end of the stream */}
          <button type="button" disabled={running || locked} onClick={onRun} style={{ ...btnPrimary, ...(running || locked ? { opacity: 0.5, cursor: "not-allowed" } : {}) }}>
            {running ? A.executing : A.execute}
          </button>
          <button type="button" disabled={running} onClick={onDismiss} style={btnQuiet}>{A.dismiss}</button>
        </div>
      )}
    </div>
  );
}

type RowProps = {
  m: Msg; i: number; cards: Record<string, CardState>;
  onRun: (k: string, c: ActionCard) => void; onDismiss: (k: string) => void; locked: boolean;
};
// Memoized: finished rows keep their identity while a later row streams, so they are not re-rendered or re-parsed.
const MsgRow = memo(function MsgRow({ m, i, cards, onRun, onDismiss, locked }: RowProps) {
  return (
    <div style={m.role === "user"
      ? { justifySelf: "end", maxWidth: "85%", background: "var(--mint-soft)", borderRadius: 8, padding: "6px 10px", fontSize: 14, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }
      : { display: "grid", gap: 6 }}>
      {m.role === "user" ? m.content : m.streaming ? (
        <div style={{ fontSize: 14, lineHeight: 1.45, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
          {m.status && <div style={{ ...small, marginBottom: 2 }}>{m.status}</div>}
          {m.deltas?.length === 0 && !m.status && <span style={small}>{A.thinking}</span>}
          {m.deltas?.map((d, j) => <span key={j} className="assistant-fade">{d}</span>)}
          <span className="assistant-caret" aria-hidden="true" />
        </div>
      ) : (
        <>
          <Answer text={m.content} />
          {m.actions?.map((c, j) => {
            const k = `${i}:${c.key}:${j}`;
            const st = cards[k] ?? (c.proposal.type === "waiting" ? cards[`${i}:w`] : undefined) ?? { phase: "idle" as const };
            return <Card key={k} card={c} st={st} onRun={() => onRun(k, c)} onDismiss={() => onDismiss(k)} locked={locked} />;
          })}
        </>
      )}
    </div>
  );
});

export function AssistantDrawer({ open, pathname, itemId, onClose }: { open: boolean; pathname: string; itemId: number | null; onClose: () => void }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const convRef = useRef<number | null>(null);
  const restored = useRef(false);

  const [tab, setTab] = useState<Tab>("chat");
  const [configured, setConfigured] = useState(true);
  const [item, setItem] = useState<{ id: number; title: string } | null>(null);
  const [notes, setNotes] = useState<NoteView[]>([]);
  const [recent, setRecent] = useState<ConversationSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [cards, setCards] = useState<Record<string, CardState>>({});
  const [quickWait, setQuickWait] = useState(false);
  const [vis, setVis] = useState(false); // drives the slide: false while closed, true one frame after open
  const pinned = useRef(true);

  // The drawer stays mounted across navigation: a half-typed note belongs to the item it was typed on.
  const [noteDraft, setNoteDraft] = useState<{ id: number | null; text: string }>({ id: null, text: "" });
  const noteText = noteDraft.id === itemId ? noteDraft.text : "";
  const setNoteText = (text: string) => setNoteDraft({ id: itemId, text });
  const [noteError, setNoteError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  const setConv = useCallback((id: number | null) => { convRef.current = id; lsSet(id); }, []);
  const abort = useCallback(() => { abortRef.current?.abort(); abortRef.current = null; setStreaming(false); }, []);

  // Mounted while closed so the close can animate; flips one frame after open so the slide-in runs.
  useEffect(() => {
    if (!open) return;
    const r = requestAnimationFrame(() => setVis(true));
    return () => { cancelAnimationFrame(r); setVis(false); };
  }, [open]);

  // Focus in on open, back to the opener on close. No trap: the page behind stays usable.
  useEffect(() => {
    if (!vis) return;
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const t = setTimeout(() => (inputRef.current ?? dialogRef.current)?.focus(), 0);
    return () => {
      clearTimeout(t);
      openerRef.current?.focus();
    };
  }, [vis]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // ONE request per open (and when the item in view changes). The conversation is applied once, on first load.
  useEffect(() => {
    if (!open) return;
    let live = true;
    const want = restored.current ? null : lsGet(); // after the first restore the client already holds the messages
    openAssistant({ itemId, conversationId: want }).then((res) => {
      if (!live) return;
      if ("error" in res) { setLoadError(res.error); return; }
      setLoadError(null);
      setConfigured(res.configured);
      setItem(res.item);
      setNotes(res.notes);
      setRecent(res.conversations);
      if (!restored.current) {
        restored.current = true;
        if (res.conversation) { setConv(res.conversation.id); setMsgs(turnsToMsgs(res.conversation)); }
        else if (want != null) setConv(null);
      }
    }).catch(() => live && setLoadError(A.genericError));
    return () => { live = false; };
  }, [open, itemId, setConv]);

  // Pin to the newest message unless the reader scrolled up (more than 40px from the bottom).
  useEffect(() => {
    const el = listRef.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [msgs, tab, vis]);

  function fresh() {
    abort();
    setConv(null);
    setMsgs([]); setCards({}); setChatError(null); setInput("");
  }

  function removeConversation() {
    const id = convRef.current;
    if (id == null) { fresh(); return; }
    if (!window.confirm(A.delConfirm)) return;
    deleteConversation(id).then((res) => {
      if ("error" in res) { setChatError(res.error); return; }
      setRecent((r) => r.filter((c) => c.id !== id));
      fresh();
    }).catch(() => setChatError(A.genericError));
  }

  function loadConversation(id: number) {
    abort();
    getConversation(id).then((res) => {
      if ("error" in res) { setChatError(res.error); return; }
      setConv(res.conversation.id);
      setMsgs(turnsToMsgs(res.conversation)); setCards({}); setChatError(null); setTab("chat");
    }).catch(() => setChatError(A.genericError));
  }

  function patchLast(f: (m: Msg) => Msg) {
    setMsgs((all) => all.length ? [...all.slice(0, -1), f(all[all.length - 1])] : all);
  }

  async function send(text: string) {
    const message = text.trim();
    if (!message || streaming) return;
    setChatError(null);
    setInput("");
    pinned.current = true;
    setMsgs((m) => [...m, { role: "user", content: message }, { role: "assistant", content: "", deltas: [], streaming: true }]);
    setStreaming(true);
    const ac = new AbortController();
    abortRef.current = ac;
    const startedConv = convRef.current;
    const fail = (msg: string) => {
      setMsgs((all) => (all.length >= 2 ? all.slice(0, -2) : all)); // drop the user bubble and the pending answer; the input is restored
      // A failed first turn: the server soft-deleted the new conversation, so forget its id.
      if (startedConv == null && convRef.current != null) {
        const dead = convRef.current;
        setConv(null);
        setRecent((r) => r.filter((c) => c.id !== dead));
      }
      setChatError(msg);
      setInput(message);
    };
    try {
      const body: ChatRequest = { conversationId: convRef.current, pathname, itemId, message };
      const res = await fetch("/api/assistant/chat", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => null) as { error?: string } | null;
        fail(j?.error ?? A.genericError);
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let finished = false;
      const handle = (ev: ChatEvent) => {
        if (ev.type === "start") {
          setConv(ev.conversationId);
          setRecent((r) => r.some((c) => c.id === ev.conversationId) ? r : [{ id: ev.conversationId, title: message.slice(0, 60), updatedAt: new Date().toISOString() }, ...r]);
        } else if (ev.type === "status") patchLast((m) => ({ ...m, status: ev.text }));
        else if (ev.type === "reset") patchLast((m) => ({ ...m, deltas: [] }));
        else if (ev.type === "delta") patchLast((m) => ({ ...m, status: undefined, deltas: [...(m.deltas ?? []), ev.text] }));
        else if (ev.type === "done") {
          finished = true;
          patchLast(() => ({ role: "assistant", content: ev.answer, actions: ev.actions }));
        } else if (ev.type === "error") { finished = true; fail(ev.message); }
      };
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const frame = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const type = /^event: (.+)$/m.exec(frame)?.[1];
          const data = /^data: (.*)$/m.exec(frame)?.[1];
          if (!type || data == null) continue;
          try { handle({ type, ...JSON.parse(data) } as ChatEvent); } catch { /* skip malformed frame */ }
        }
      }
      if (!finished) fail(A.genericError);
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) fail(A.genericError);
    } finally {
      if (abortRef.current === ac) { abortRef.current = null; setStreaming(false); }
    }
  }

  function quickWaiting() {
    if (configured) { void send(A.quickWaiting); return; }
    setQuickWait(true);
    whatsWaiting().then((res) => {
      const w = "error" in res ? null : res.waiting;
      setMsgs((m) => [...m, { role: "user", content: A.quickWaiting }, { role: "assistant", content: "error" in res ? res.error : A.waitingItems, actions: w ? [{ key: `w${Date.now()}`, summary: A.quickWaiting, proposal: { type: "waiting" } }] : [] }]);
      if (w) setCards((c) => ({ ...c, [`${msgs.length + 1}:w`]: { phase: "done", waiting: w } }));
    }).catch(() => setChatError(A.genericError)).finally(() => setQuickWait(false));
  }

  const patchCard = useCallback((k: string, s: CardState) => { setCards((c) => ({ ...c, [k]: s })); }, []);
  const dismissCard = useCallback((k: string) => patchCard(k, { phase: "dismissed" }), [patchCard]);

  const run = useCallback((k: string, card: ActionCard) => {
    const p = card.proposal;
    if (p.type === "none") return;
    if (p.type === "open_item") { router.push(`/marketing/${p.itemId}`); patchCard(k, { phase: "done" }); return; }
    if (p.type === "navigate") { router.push(p.path); patchCard(k, { phase: "done" }); return; }
    patchCard(k, { phase: "running" });
    if (p.type === "waiting") {
      whatsWaiting().then((res) => patchCard(k, "error" in res ? { phase: "idle", error: res.error } : { phase: "done", waiting: res.waiting }))
        .catch(() => patchCard(k, { phase: "idle", error: A.genericError }));
      return;
    }
    const conversationId = convRef.current;
    executeAction(p, conversationId != null ? { conversationId, key: card.key } : undefined).then((res) => {
      if ("error" in res) { patchCard(k, { phase: "idle", error: res.error }); return; }
      patchCard(k, { phase: "done", message: res.message, state: res.state, href: res.href });
      router.refresh();
    }).catch(() => patchCard(k, { phase: "idle", error: A.genericError }));
  }, [router, patchCard]);

  function saveNote() {
    if (item == null || item.id !== itemId || !noteText.trim() || loadError) return;
    const target = item.id;
    setNoteError(null);
    startSave(async () => {
      try {
        const res = await addItemNote({ itemId: target, body: noteText.trim() });
        if ("error" in res) setNoteError(res.error);
        else { setNotes((n) => [res.note, ...n]); setNoteText(""); }
      } catch { setNoteError(A.genericError); }
    });
  }

  const noAi = !configured;
  const tabBtn = (t: Tab, label: string) => (
    <button type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
      style={{ ...btnQuiet, ...(tab === t ? { background: "var(--mint-soft)", color: "var(--mint-fg)", border: "1px solid var(--mint-line)" } : {}) }}>
      {label}
    </button>
  );

  const ticketChip = itemId != null && item?.id === itemId;
  return (
    <>
      <style>{`
        .assistant-drawer { position: fixed; top: 0; right: 0; bottom: 0; width: 420px; z-index: 40; display: flex; flex-direction: column;
          transform: translateX(100%); opacity: 0; visibility: hidden; pointer-events: none;
          transition: transform 200ms ease, opacity 200ms ease, visibility 0s linear 200ms;
          background: var(--bg-page); color: var(--fg); border-left: 1px solid var(--line-soft); padding-bottom: env(safe-area-inset-bottom); }
        .assistant-drawer[data-open="true"] { transform: none; opacity: 1; visibility: visible; pointer-events: auto; transition: transform 200ms ease, opacity 200ms ease, visibility 0s; }
        .assistant-chip:hover:not(:disabled) { border-color: var(--mint-line); background: var(--mint-soft); }
        .assistant-chip:disabled { opacity: 0.5; cursor: not-allowed; }
        @media (max-width: 767px) { .assistant-drawer { width: 100vw; border-left: 0; } }
        @keyframes assistantFade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes assistantBlink { 50% { opacity: 0 } }
        .assistant-fade { animation: assistantFade 180ms ease-out; }
        .assistant-caret { display: inline-block; width: 7px; height: 14px; margin-left: 2px; vertical-align: text-bottom; background: var(--fg-mute); animation: assistantBlink 1s steps(1) infinite; }
        @media (prefers-reduced-motion: reduce) { .assistant-fade, .assistant-caret { animation: none; } .assistant-drawer, .assistant-drawer[data-open="true"] { transition: none; } }
      `}</style>
      <div ref={dialogRef} className="assistant-drawer" role="dialog" aria-modal="false" data-open={vis ? "true" : "false"} aria-hidden={vis ? undefined : true} aria-label={A.dialog} tabIndex={-1}
        onKeyDown={(e) => { if (e.key === "Escape" && !e.defaultPrevented) onClose(); }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: "1px solid var(--line-soft)", flexWrap: "wrap" }}>
          <strong style={{ fontSize: 15, flex: 1 }}>{A.dialog}</strong>
          <button type="button" onClick={fresh} style={btnQuiet}>{A.newChat}</button>
          <button type="button" onClick={removeConversation} style={btnQuiet}>{A.del}</button>
          <button type="button" onClick={onClose} aria-label={A.close} style={btnQuiet}>{A.close}</button>
        </div>
        <details style={{ padding: "6px 12px", borderBottom: "1px solid var(--line-soft)" }}>
          <summary style={{ fontSize: 13, color: "var(--fg-mute)", cursor: "pointer", minHeight: 36, display: "flex", alignItems: "center" }}>{A.previous}</summary>
          {recent.length === 0 && <p style={{ ...small, margin: "4px 0" }}>{A.noPrevious}</p>}
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 2 }}>
            {recent.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => loadConversation(c.id)}
                  style={{ ...btnQuiet, width: "100%", textAlign: "left", display: "flex", justifyContent: "space-between", gap: 8, border: "0", fontWeight: c.id === convRef.current ? 700 : 400 }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title || A.untitled}</span>
                  <span style={{ ...small, flexShrink: 0, alignSelf: "center" }}>{budapestDate(c.updatedAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        </details>
        <div role="tablist" style={{ display: "flex", gap: 8, padding: "8px 12px" }}>
          {tabBtn("chat", A.tabChat)}
          {tabBtn("notes", A.tabNotes)}
        </div>
        {loadError && <p role="alert" style={{ ...errStyle, padding: "0 12px", margin: 0 }}>{loadError}</p>}

        {tab === "chat" && (
          <>
            <div ref={listRef} onScroll={(e) => { const el = e.currentTarget; pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight <= 40; }} style={{ flex: 1, overflowY: "auto", padding: "8px 12px", display: "grid", gap: 10, alignContent: "start" }}>
              {msgs.length === 0 && (
                <div role="group" aria-label={A.suggestions} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" className="assistant-chip" disabled={quickWait || streaming} onClick={quickWaiting} style={chip}>{A.quickWaiting}</button>
                  <button type="button" className="assistant-chip" disabled={noAi || streaming} onClick={() => send(A.quickDrafts)} style={chip}>{A.quickDrafts}</button>
                  {ticketChip && item ? (
                    <button type="button" className="assistant-chip" disabled={noAi || streaming} onClick={() => send(`${A.chipTicket}: ${item.title}`)} style={chip}>{A.chipTicket}</button>
                  ) : (
                    <button type="button" className="assistant-chip" disabled={noAi || streaming} onClick={() => send(A.quickAbilities)} style={chip}>{A.quickAbilities}</button>
                  )}
                </div>
              )}
              {noAi && <p style={{ fontSize: 13, color: "var(--fg-mute)", margin: 0 }}>{A.notConfigured}</p>}
              {msgs.map((m, i) => <MsgRow key={i} m={m} i={i} cards={cards} onRun={run} onDismiss={dismissCard} locked={streaming} />)}
              {chatError && <p role="alert" style={{ ...errStyle, margin: 0 }}>{chatError}</p>}
            </div>
            <form onSubmit={(e) => { e.preventDefault(); void send(input); }} style={{ display: "flex", gap: 8, padding: "8px 12px", borderTop: "1px solid var(--line-soft)" }}>
              <input ref={inputRef} aria-label={A.inputPlaceholder} placeholder={A.inputPlaceholder} maxLength={2000} value={input} disabled={noAi}
                onChange={(e) => setInput(e.target.value)} style={{ ...field, flex: 1, ...(noAi ? { opacity: 0.5 } : {}) }} />
              <button type="submit" disabled={noAi || streaming || !input.trim()} style={{ ...btn, ...(noAi || streaming || !input.trim() ? { opacity: 0.5, cursor: "not-allowed" } : {}) }}>{A.send}</button>
            </form>
          </>
        )}

        {tab === "notes" && (
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px", display: "grid", gap: 10, alignContent: "start" }}>
            {item == null ? (
              <p style={{ fontSize: 14, color: "var(--fg-mute)", margin: 0 }}>{A.noteNeedItem}</p>
            ) : (
              <>
                <div style={small}>#{item.id} {item.title}</div>
                <textarea aria-label={A.notePlaceholder} placeholder={A.notePlaceholder} rows={3} value={noteText}
                  onChange={(e) => setNoteText(e.target.value)} style={{ ...field, resize: "vertical" }} />
                {noteError && <p style={{ ...errStyle, margin: 0 }}>{noteError}</p>}
                <div>
                  <button type="button" disabled={saving || !noteText.trim() || !!loadError} onClick={saveNote}
                    style={{ ...btn, ...(saving || !noteText.trim() ? { opacity: 0.5, cursor: "not-allowed" } : {}) }}>{A.noteSave}</button>
                </div>
                {notes.length === 0 && <p style={{ fontSize: 13, color: "var(--fg-faint)", margin: 0 }}>{A.noteEmpty}</p>}
                {notes.map((n) => (
                  <div key={n.id} style={{ borderTop: "1px solid var(--line-soft)", paddingTop: 8 }}>
                    <div style={{ ...small, marginBottom: 4 }}>{n.author} {new Date(n.createdAt).toLocaleString("hu-HU", { timeZone: "Europe/Budapest" })}</div>
                    <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 14, lineHeight: 1.45 }}>{n.body}</div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
