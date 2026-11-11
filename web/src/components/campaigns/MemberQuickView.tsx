"use client";
// Prospect quick view: a side sheet over the member list or the Hívás mód card. Read only (the
// action writes nothing). Built on the native modal <dialog>: focus moves in, Esc closes, the page
// behind is inert, focus returns to the row. One primary action: open the company.
// Hungarian copy is PROPOSAL until Áron approves it.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import k from "@/components/astryx/page.module.css";
import s from "@/app/(app)/campaigns/campaigns.module.css";
import { memberQuickViewAction } from "@/app/actions/campaign-hub";
import { assetStateLabel, CHANNEL_LABEL, memberStateLabel } from "@/lib/campaigns/labels";
import type { QuickView, StepEmail } from "@/lib/campaigns/preview";
import { fieldLabel, type Part } from "@/lib/campaigns/email-preview";
import type { StepChannel } from "@/lib/campaigns/rules";

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("hu-HU", { timeZone: "Europe/Budapest" }) : null);
const Missing = ({ children }: { children: React.ReactNode }) => <span className={s.missing}>{children}</span>;

/** Rendered text with each unresolved field as a visible marker (text only: React escapes every value). */
export function PartsText({ parts }: { parts: readonly Part[] }) {
  return <>{parts.map((p, i) => ("t" in p ? <span key={i}>{p.t}</span> : <mark key={i} className={s.marker} aria-label={`kitöltetlen mező: ${fieldLabel(p.missing)}`}>{`{{${p.missing}}}`}</mark>))}</>;
}

export function EmailPreview({ e, sender, editHref }: { e: StepEmail; sender: QuickView["sender"]; editHref: string }) {
  if (!e.rendered) {
    return (
      <div className={s.mail}>
        <p className={k.muted} style={{ margin: 0 }}>{e.position}. lépés: ehhez a taghoz nincs e-mail anyag. A lépéshez (vagy a tag szegmenséhez) nincs csatolva anyag.</p>
        <Link href={editHref} className={k.link}>Anyag csatolása a lépésekhez</Link>
      </div>
    );
  }
  const r = e.rendered;
  const approved = e.status === "live";
  return (
    <div className={s.mail}>
      <div className={s.mailMeta}>
        <span>Állapot</span>
        <span className={s.state} data-s={e.status ?? undefined}>
          {e.status ? assetStateLabel(e.status) : "-"}{e.version ? `, v${e.version}` : ""}
          {e.approvedBy.length ? `, jóváhagyta: ${e.approvedBy.join(", ")}` : approved ? "" : ", még senki nem hagyta jóvá"}
          {e.via === "variant" ? " (szegmensváltozat)" : ""}
        </span>
        <span>Feladó</span><span>{sender.from ?? <Missing>nincs beállítva (Beállítások, Integrációk, Resend)</Missing>}</span>
        <span>Válaszcím</span><span>{sender.replyTo ?? <Missing>nincs megadva</Missing>}</span>
        <span>Tárgy</span><span className={k.strong}><PartsText parts={r.subject} /></span>
      </div>
      {!approved && <p className={s.flag}>Javaslat: amíg nem élő, ebből a levélből nem készül piszkozat, és nem megy ki.</p>}
      <pre className={s.mailBody}><PartsText parts={r.body} />{sender.footer ? `\n\n${sender.footer}` : ""}</pre>
      {!sender.footer && <p className={s.flag}>Nincs leiratkozási lábléc beállítva: a küldés ezt elutasítja.</p>}
      {r.missing.length > 0 && <p className={s.flag}>{r.missing.length} kitöltetlen mező: {r.missing.map(fieldLabel).join(", ")}. Ilyen levélből nem készül piszkozat.</p>}
      {r.suffix.length > 0 && <p className={s.flag}>Toldalék tapad a mezőre ({r.suffix.map(fieldLabel).join(", ")}): a sablont toldalék nélküli szerkezetre kell írni.</p>}
      {r.notes.map((n) => <p key={n} className={k.muted} style={{ margin: 0 }}>{n}</p>)}
    </div>
  );
}

function Body({ v, slug }: { v: QuickView; slug: string }) {
  const m = v.member;
  const h = v.history;
  const cl = h.controlLabor;
  const origin = v.contact.origin;
  const hasHistory = h.leads.length || h.deals.length || h.campaigns.length || h.events.length || h.interactions || cl.accountType || cl.customerValue || cl.frequency || cl.methods.length;
  return (
    <>
      <section className={s.sheetSec} aria-labelledby="qv-why">
        <h3 id="qv-why">Miért van a listán</h3>
        <div>{m.why ?? <Missing>Az ok nincs rögzítve ennél a tagnál.</Missing>}</div>
        <div className={k.muted}>Forrás: {m.source ?? "nincs rögzítve (a betöltés még nem tárolta)"}{m.importBatch ? `, betöltés: ${m.importBatch}` : ""}</div>
      </section>
      <section className={s.sheetSec} aria-labelledby="qv-contact">
        <h3 id="qv-contact">Elérés</h3>
        {v.contact.name ? <div className={k.strong}>{v.contact.name}{v.contact.role ? `, ${v.contact.role}` : ""}</div> : <Missing>Nincs megnevezett kapcsolattartó.</Missing>}
        <div>
          {v.contact.email
            ? <>{v.contact.email} <span className={k.muted}>({v.contact.kind === "role" ? "közös cím" : "személyes cím"})</span></>
            : <Missing>Nincs e-mail cím.</Missing>}
        </div>
        <div>{v.contact.phone ?? <Missing>Nincs telefonszám.</Missing>}</div>
        <div className={k.muted}>
          Honnan: {origin?.kind === "page" ? <>a listaépítő ezen az oldalon találta: <span className={s.code}>{origin.value}</span></>
            : origin?.kind === "load" ? `a betöltési fájlból (${origin.value ?? "?"}); az oldal, ahol találták, nincs rögzítve`
            : origin?.kind === "crm" ? "már a CRM-ben volt (meglévő kapcsolat)"
            : "nincs rögzítve"}
        </div>
      </section>
      <section className={s.sheetSec} aria-labelledby="qv-state">
        <h3 id="qv-state">Állapot a kampányban</h3>
        <div>{memberStateLabel(m.state)}, {m.stepPosition}. lépés a {m.stepCount}-ből{m.stepChannel ? ` (${CHANNEL_LABEL[m.stepChannel as StepChannel] ?? m.stepChannel})` : ""}</div>
        <div className={k.muted}>Próbák: {m.attempts}{m.lastOutcome ? `, utolsó: ${m.lastOutcome}` : ""}{m.lastTouchedAt ? `, ${day(m.lastTouchedAt)}` : ""}</div>
      </section>
      <section className={s.sheetSec} aria-labelledby="qv-history">
        <h3 id="qv-history">Előzmények nálunk</h3>
        {!hasHistory && <Missing>Nincs előzmény a CRM-ben: se lead, se üzlet, se korábbi kampány, se Control Labor adat.</Missing>}
        {h.leads.map((l) => <div key={l.id}><Link href={`/leads/${l.id}`} className={k.link}>Lead #{l.id}</Link> <span className={k.muted}>{l.status ?? ""} {l.outcome}{l.at ? `, ${day(l.at)}` : ""}</span></div>)}
        {h.deals.map((d) => <div key={d.id}>Üzlet: {d.title} <span className={k.muted}>{d.stage ?? ""}</span></div>)}
        {h.campaigns.map((c) => <div key={c.slug}><Link href={`/campaigns/${c.slug}`} className={k.link}>{c.name}</Link> <span className={k.muted}>{memberStateLabel(c.state)}</span></div>)}
        {h.events.length > 0 && <div className={k.muted}>Érintések itt: {h.events.map((e) => `${e.step}. lépés ${e.outcome} (${day(e.at)})`).join("; ")}</div>}
        {h.interactions > 0 && <div className={k.muted}>{h.interactions} rögzített interakció{h.lastInteraction ? `, utolsó ${day(h.lastInteraction)}` : ""}</div>}
        {(cl.accountType || cl.customerValue || cl.frequency || cl.methods.length > 0) && (
          <div className={k.muted}>Control Labor: {[cl.accountType, cl.customerValue ? `${cl.customerValue.toLocaleString("hu-HU")} Ft forgalom` : null, cl.frequency, cl.methods.length ? cl.methods.join("/") : null].filter(Boolean).join(", ")}</div>
        )}
      </section>
      <section className={s.sheetSec} aria-labelledby="qv-mail">
        <h3 id="qv-mail">Az e-mail, ahogy ő kapná</h3>
        {v.emails.length === 0 && <Missing>A kampánynak nincs e-mail lépése.</Missing>}
        {v.emails.map((e) => <EmailPreview key={e.position} e={e} sender={v.sender} editHref={`/campaigns/${slug}?tab=overview`} />)}
      </section>
    </>
  );
}

export function MemberQuickView({ slug, memberId, onClose }: { slug: string; memberId: number | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  // Keyed by member id: a result for another row is never shown, and no state is reset inside the effect.
  const [res, setRes] = useState<{ id: number; view?: QuickView; error?: string } | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (memberId == null) {
      if (!d.open) return;
      if (typeof d.close === "function") d.close();
      else d.removeAttribute("open");
      return;
    }
    if (!d.open) {
      if (typeof d.showModal === "function") d.showModal();
      else d.setAttribute("open", "");
    }
    let live = true;
    memberQuickViewAction(slug, memberId)
      .then((r) => { if (live) setRes("error" in r ? { id: memberId, error: r.error } : { id: memberId, view: r.view }); })
      .catch(() => { if (live) setRes({ id: memberId, error: "Hálózati hiba, próbáld újra" }); });
    return () => { live = false; };
  }, [slug, memberId]);

  const mine = res && res.id === memberId ? res : null;
  const view = mine?.view ?? null;
  const error = mine?.error ?? null;
  const v = view;
  const sub = v ? [v.member.segmentLabel ? `${v.member.segment}: ${v.member.segmentLabel}` : "szegmens ismeretlen", v.member.lane, v.member.city, v.member.tier ? `${v.member.tier} szint` : null].filter(Boolean).join(" · ") : "";
  return (
    <dialog ref={ref} className={s.sheet} aria-labelledby="qv-title" aria-describedby={v ? "qv-sub" : undefined} onClose={onClose}
      onClick={(e) => { if (e.target === e.currentTarget) ref.current?.close(); }}>
      {/* Fills the sheet, so only a click on the backdrop has the dialog itself as its target (Vanda #195-7). */}
      <div className={s.sheetInner}>
      <div className={s.sheetHead}>
        <div>
          <h2 id="qv-title">{v ? v.company.name : "Tag"}</h2>
          {v && <div id="qv-sub" className={k.muted}>{sub}</div>}
        </div>
        <button type="button" className={`${k.btn} ${k.btnIcon}`} onClick={() => ref.current?.close()} aria-label="Bezárás">×</button>
      </div>
      <div className={s.sheetBody} aria-busy={!v && !error}>
        {error && <p className={s.err} role="alert">{error}</p>}
        {!v && !error && <p className={k.muted} role="status">Betöltés...</p>}
        {v && v.problems.length > 0 && (
          <ul className={s.flag} aria-label="Ami hiányzik" style={{ listStyle: "none" }}>
            {v.problems.map((p) => <li key={p}>{p}</li>)}
          </ul>
        )}
        {v && <Body v={v} slug={slug} />}
      </div>
      {v && (
        <div className={s.sheetFoot}>
          <Link href={`/companies/${v.company.id}`} className={`${k.btn} ${k.btnPrimary}`}>Cég megnyitása</Link>
          {v.history.leadId && <Link href={`/leads/${v.history.leadId}`} className={k.btn}>Lead megnyitása</Link>}
        </div>
      )}
      </div>
    </dialog>
  );
}
