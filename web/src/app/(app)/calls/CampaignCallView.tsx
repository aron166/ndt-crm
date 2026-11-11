"use client";
// Hívás mód, campaign tab: today's capped list grouped by city, the campaign's own call script
// (its LIVE content item, nothing else) beside the selected company, and the five outcomes.
// Érdeklődik and Kéri promote the company to a lead without an SLA task (lib/campaigns/rules).
// Built for Péter's phone first: one column under 760 px. Hungarian copy is PROPOSAL.

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import k from "@/components/astryx/page.module.css";
import { groupByCity } from "@/lib/campaigns/labels";
import { recordCampaignOutcomeAction } from "@/app/actions/campaign-hub";
import { MemberQuickView } from "@/components/campaigns/MemberQuickView";
import s from "../campaigns/campaigns.module.css";

export interface CallItem {
  id: number; attempts: number; lastOutcome: string | null; lastTouchedAt: string | null; why: string | null;
  tier: string | null; city: string | null; stepPosition: number;
  company: { id: number; name: string; city: string | null; website: string | null };
  person: { id: number; firstName: string; lastName: string; phone: string | null; email: string | null } | null;
}
export interface CallViewData {
  campaign: { slug: string; name: string; status: string; dailyCap: number };
  items: CallItem[]; touchedToday: number; remaining: number;
  script: { id: number; title: string; body: string } | null;
  /** Each call step's own live script, by step position (item 6). */
  scripts?: Record<number, { id: number; title: string; body: string }>;
}

/** The five taps of the mockup, same keys and labels as Hívás mód (lib/outreach/queue CALL_OUTCOMES). */
export const CAMPAIGN_OUTCOMES = [
  { key: "no_answer", label: "Nem vették fel" },
  { key: "interested", label: "Érdeklődik" },
  { key: "wants", label: "Kéri / akarja" },
  { key: "not_interested", label: "Nem érdekli" },
  { key: "bad_number", label: "Rossz szám" },
] as const;

const LAST: Record<string, string> = { no_answer: "nem vették fel", email_sent: "e-mail elment" };

export function CampaignCallView({ slug, data }: { slug: string; data: CallViewData }) {
  const card = useRef<HTMLElement>(null);
  const [done, setDone] = useState<Set<number>>(new Set());
  const items = useMemo(() => data.items.filter((i) => !done.has(i.id)), [data.items, done]);
  const [selected, setSelected] = useState<number | null>(data.items[0]?.id ?? null);
  // One note per member: a note typed on company A never goes out with company B's tap (interactions are append-only).
  const [notesBy, setNotesBy] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [peek, setPeek] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; leadId?: number } | null>(null);
  const current = items.find((i) => i.id === selected) ?? items[0] ?? null;
  // The selected company's own step script; `scripts` absent (older payload) falls back to the one script.
  const script = data.scripts && current ? data.scripts[current.stepPosition] ?? null : data.script;
  const notes = current ? notesBy[current.id] ?? "" : "";
  const groups = groupByCity(items);
  const personName = (p: CallItem["person"]) => (p ? `${p.lastName} ${p.firstName}`.replace(/^- | -$/g, "").trim() : null);

  async function tap(outcome: string) {
    if (!current || busy) return;
    setBusy(true);
    setMsg(null);
    let r: Awaited<ReturnType<typeof recordCampaignOutcomeAction>>;
    try {
      r = await recordCampaignOutcomeAction(slug, { member_id: current.id, outcome, ...(notes.trim() ? { notes: notes.trim() } : {}) });
    } catch {
      return setMsg({ ok: false, text: "Hálózati hiba, próbáld újra" });
    } finally {
      setBusy(false);
    }
    if ("error" in r) return setMsg({ ok: false, text: r.error ?? "Hiba" });
    // Next in the order shown (grouped by city), wrapping to the top.
    const ordered = groups.flatMap((g) => g.items);
    const at = ordered.findIndex((i) => i.id === current.id);
    const next = ordered.slice(at + 1).concat(ordered.slice(0, at))[0] ?? null;
    setDone((d) => new Set(d).add(current.id));
    setSelected(next?.id ?? null);
    setNotesBy((n) => ({ ...n, [current.id]: "" }));
    setMsg(r.lead
      ? { ok: true, text: `${current.company.name}: lead lett, a Leadek oldalon a megfelelő oszlopban, SLA feladat nélkül.`, leadId: r.lead.id }
      : { ok: true, text: `${current.company.name}: rögzítve.` });
    // No router.refresh(): the action's revalidatePath("/calls") already returns the fresh list (Vanda #191-4).
  }

  function pick(id: number) {
    setSelected(id);
    // On a phone the card sits above the list: bring it into view (Vanda #191-5).
    if (typeof window !== "undefined" && window.matchMedia?.("(max-width: 760px)").matches) card.current?.scrollIntoView({ block: "start" });
  }

  return (
    <div>
      <h1 className={`${k.title} ${s.callTitle}`}>Hívás mód</h1>
      <p className={k.muted}>
        <span className={k.strong}>{data.campaign.name}</span> · Ma {data.touchedToday} / {data.campaign.dailyCap} · hátra {Math.max(0, data.remaining)}
      </p>
      {msg && (
        <p className={msg.ok ? s.ok : s.err} role="status">
          {msg.text} {msg.leadId && <Link href={`/leads/${msg.leadId}`} className={k.link}>Lead megnyitása</Link>}
        </p>
      )}
      {items.length === 0 ? (
        <div className={k.empty}>Mára nincs több hívás ebben a kampányban.</div>
      ) : (
        <div className={s.callSplit}>
          <nav aria-label="Mai hívólista">
            {groups.map((g) => (
              <div key={g.city}>
                <div className={s.cityHead}>{g.city}</div>
                {g.items.map((it) => (
                  <button key={it.id} type="button" className={s.callRow} aria-current={current?.id === it.id ? "true" : undefined} onClick={() => pick(it.id)}>
                    <b>{it.company.name}</b>
                    <span className={k.muted}>
                      {[personName(it.person), it.tier, it.attempts > 0 ? `${it.attempts + 1}. próba` : null, it.lastOutcome ? LAST[it.lastOutcome] ?? null : null].filter(Boolean).join(" · ")}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </nav>
          {current && (
            <section ref={card} className={`${k.card} ${s.callCard}`} aria-label="Kiválasztott cég">
              <div>
                <h2 className={k.groupTitle}>{current.company.name}</h2>
                {current.why && <p className={k.muted} style={{ margin: "4px 0 0" }}>Miért: {current.why}</p>}
                <button type="button" className={k.link} style={{ background: "none", border: 0, padding: 0, cursor: "pointer" }} aria-haspopup="dialog" onClick={() => setPeek(current.id)}>Részletek és az elküldött e-mail</button>
              </div>
              {current.person && (
                <div>
                  <div className={k.strong}>{personName(current.person)}</div>
                  {current.person.phone
                    ? <a href={`tel:${current.person.phone.replace(/\s+/g, "")}`} className={s.callPhone}>{current.person.phone}</a>
                    : <span className={k.muted}>Nincs telefonszám</span>}
                </div>
              )}
              <div className={s.panel}>
                {script ? (
                  <>
                    <div className={k.strong}>{script.title} (Anyagok, élő)</div>
                    <div className={s.script}>{script.body}</div>
                  </>
                ) : (
                  <p className={k.muted} style={{ margin: 0 }}>Nincs jóváhagyott hívásszkript ehhez a kampányhoz. A szkript az Anyagok jóváhagyási sorából jön.</p>
                )}
              </div>
              <label className={s.field}>
                <span>Jegyzet</span>
                <textarea className={s.input} value={notes} onChange={(e) => current && setNotesBy((n) => ({ ...n, [current.id]: e.target.value }))} maxLength={2000} disabled={busy} />
              </label>
              <div className={s.outcomes} role="group" aria-label="Kimenetel">
                {CAMPAIGN_OUTCOMES.map((o) => (
                  <button key={o.key} type="button" className={k.btn} disabled={busy} onClick={() => tap(o.key)}>{o.label}</button>
                ))}
              </div>
              <p className={k.muted} style={{ margin: 0 }}>Érdeklődik vagy Kéri után a cég lead lesz a Leadek oldalon, a megfelelő oszlopban, SLA feladat nélkül.</p>
            </section>
          )}
        </div>
      )}
      <MemberQuickView slug={slug} memberId={peek} onClose={() => setPeek(null)} />
    </div>
  );
}
