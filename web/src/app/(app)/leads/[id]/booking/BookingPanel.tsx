"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { TextInput } from "@astryxdesign/core/TextInput";
import { BOOKING_KINDS, BOOKING_KIND_LABEL, type BookingKind } from "@/lib/booking/priority";
import {
  getLeadSite,
  postBooking,
  postCheck,
  postSlots,
  type BundleHintDto,
  type RankedSlotDto,
  type SettlementDto,
  type SiteSource,
  type SlotsResultDto,
} from "./booking-api";
import { budapestIso, dayKeyOf, fmtDate, gridRows } from "./booking-view";
import { MachineDayGrid, type Probe } from "./MachineDayGrid";
import { ManualTimeCheck, type BookArgs } from "./ManualTimeCheck";
import { SitePicker } from "./SitePicker";
import { SlotCard } from "./SlotCard";
import css from "./booking.module.css";

const keyOf = (s: { machineId: number; startsAt: string }) => `${s.machineId}@${s.startsAt}`;
const MAX_PROBES = 7;

export function BookingPanel({ leadId, leadOpen, initialKind = "single_machine_demo", onBooked, embedded = false }: { embedded?: boolean; leadId: number; leadOpen: boolean; initialKind?: BookingKind; onBooked?: (kind: BookingKind, taskId: number) => void }) {
  const router = useRouter();
  const [siteLoaded, setSiteLoaded] = useState(false);
  const [siteError, setSiteError] = useState<string | null>(null);
  const [settlement, setSettlement] = useState<SettlementDto | null>(null);
  const [siteSource, setSiteSource] = useState<SiteSource>("stated");
  const [address, setAddress] = useState("");
  const [changing, setChanging] = useState(false);
  const [kind, setKind] = useState<BookingKind>(initialKind);
  const [days, setDays] = useState(21);

  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [result, setResult] = useState<SlotsResultDto | null>(null);
  const [cards, setCards] = useState<RankedSlotDto[]>([]);
  const [extra, setExtra] = useState<RankedSlotDto | null>(null);
  const [conflict, setConflict] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [probes, setProbes] = useState<Record<string, Probe | undefined>>({});

  const [pending, setPending] = useState(false);
  const [bookError, setBookError] = useState<{ from: "main" | "manual"; msg: string } | null>(null);
  const [booked, setBooked] = useState<string | null>(null);
  const run = useRef(0);

  // 1. site prefill (only for open leads)
  useEffect(() => {
    if (!leadOpen) return;
    let stale = false;
    getLeadSite(leadId).then((r) => {
      if (stale) return;
      if (!r.ok) setSiteError(r.error);
      else {
        setSettlement(r.data.settlement);
        setAddress(r.data.address ?? "");
        setSiteSource(r.data.source ?? "stated");
      }
      setSiteLoaded(true);
    });
    return () => {
      stale = true;
    };
  }, [leadId, leadOpen]);

  // 2. search whenever site, kind or days change
  useEffect(() => {
    if (!leadOpen || !settlement) return;
    const id = ++run.current;
    // Reset in a microtask: the lint rule forbids synchronous setState in an effect body.
    queueMicrotask(() => {
      if (id !== run.current) return;
      setLoading(true);
      setSearchError(null);
      setResult(null);
      setProbes({});
      setExtra(null);
      setConflict(false);
      // Old cards would keep a live book button for a slot never proposed for this site or kind.
      setCards([]);
      setSelectedKey(null);
    });
    postSlots({ settlementId: settlement.id, kind, siteSource, count: 3, days }).then(async (r) => {
      if (id !== run.current) return;
      setLoading(false);
      if (!r.ok) {
        setCards([]);
        setSearchError(r.status === 409 ? "Nincs foglalható gép beállítva." : r.error); // PROPOSAL copy
        return;
      }
      setResult(r.data);
      setCards(r.data.slots);
      setSelectedKey(r.data.slots[0] ? keyOf(r.data.slots[0]) : null);
      // shortcut: one 09:00 probe per day, upgrade when the API returns per-day verdicts.
      const taken = new Set(r.data.slots.map((s) => dayKeyOf(s.startsAt)));
      const probeDays = gridRows(r.data.from, r.data.slots.map((s) => s.startsAt)).filter((d) => !taken.has(d.key)).slice(0, MAX_PROBES);
      if (r.data.slots.length === 0) return;
      setProbes(Object.fromEntries(probeDays.map((d) => [d.key, "loading" as const])));
      await Promise.all(
        probeDays.map(async (d) => {
          const c = await postCheck({ settlementId: settlement.id, kind, siteSource, startsAt: budapestIso(d.key, "09:00") });
          if (id === run.current) setProbes((p) => ({ ...p, [d.key]: c.ok ? c.data : "error" }));
        }),
      );
    });
  }, [leadOpen, settlement, kind, siteSource, days]);

  const allCards = extra ? [extra, ...cards.filter((c) => keyOf(c) !== keyOf(extra))] : cards;
  const selected = allCards.find((c) => keyOf(c) === selectedKey) ?? null;
  const machines = result?.machines ?? [];
  const machineOf = (id: number) => machines.find((m) => m.id === id);

  const pick = (s: SettlementDto) => {
    setSettlement(s);
    setSiteSource("stated");
    setChanging(false);
    setDays(21);
  };

  const book = useCallback(
    async (a: BookArgs, from: "main" | "manual") => {
      if (!settlement) return;
      setPending(true);
      setBookError(null);
      const r = await postBooking({
        leadId,
        settlementId: settlement.id,
        siteSource,
        ...(address.trim() ? { siteAddress: address.trim() } : {}),
        startsAt: a.startsAt,
        kind,
        ...(a.machineId ? { machineId: a.machineId } : {}),
        ...(a.overrideReason ? { overrideReason: a.overrideReason } : {}),
      });
      setPending(false);
      if (r.ok) {
        setBooked(fmtDate(a.startsAt));
        onBooked?.(kind, r.data.taskId);
        router.refresh();
      } else if (r.status === 409 && r.check) {
        setConflict(true);
        setExtra(null);
        setCards(r.check.alternatives);
        setSelectedKey(r.check.alternatives[0] ? keyOf(r.check.alternatives[0]) : null);
      } else setBookError({ from, msg: r.error });
    },
    [leadId, settlement, siteSource, address, kind, router, onBooked],
  );

  async function pickBundle(b: BundleHintDto) {
    if (!settlement || !b.suggestedStart) return;
    const r = await postCheck({ settlementId: settlement.id, kind, siteSource, startsAt: b.suggestedStart, ...(b.suggestedMachineId ? { machineId: b.suggestedMachineId } : {}) });
    if (!r.ok) return setBookError({ from: "main", msg: r.error });
    const m = r.data.machines.find((x) => x.machineId === r.data.bestMachineId);
    if (!r.data.feasible || !m) return setBookError({ from: "main", msg: "Erre a javasolt időpontra már nem lehet foglalni." }); // PROPOSAL copy
    const slot: RankedSlotDto = { ...m, cost: 0, reason: "same_trip", bundles: r.data.bundles };
    setExtra(slot);
    setSelectedKey(keyOf(slot));
  }

  if (!leadOpen) {
    return (
      <section className={embedded ? css.embedded : css.panel} aria-label="Időpont foglalása">
        {!embedded && <Heading level={2}>Időpont foglalása</Heading>}
        <span className={css.muted}>Lezárt leadre nem lehet foglalni.</span>
      </section>
    );
  }

  if (booked) {
    return (
      <section className={embedded ? css.embedded : css.panel} aria-label="Időpont foglalása">
        {!embedded && <Heading level={2}>Időpont foglalása</Heading>}
        <span className={css.ok} role="status">Lefoglalva: {booked}. A feladat létrejött.</span>
      </section>
    );
  }

  const showPicker = siteLoaded && (!settlement || changing);
  const grid = result && result.slots.length > 0 ? gridRows(result.from, result.slots.map((s) => s.startsAt)) : [];

  return (
    <section className={embedded ? css.embedded : css.panel} aria-label="Időpont foglalása">
      {!embedded && <Heading level={2}>Időpont foglalása</Heading>}

      {!siteLoaded && <div className={css.skeleton} style={{ height: 44 }} aria-busy="true" />}
      {siteError && <span className={css.err} role="alert">{siteError}</span>}
      {settlement && (
        <div className={css.stack}>
          <div className={css.row}>
            <span><strong>Helyszín:</strong> {settlement.name}, {settlement.county}</span>
            {!changing && <button type="button" className={css.link} onClick={() => setChanging(true)}>Másik helyszín</button>}
          </div>
          {siteSource === "company_address_assumed" ? (
            <div><Badge variant="warning" label="A cég címéből feltételezve, erősítsd meg a hívásban" /></div>
          ) : (
            <span className={css.muted}>az ügyfél adta meg</span>
          )}
        </div>
      )}
      {showPicker && <SitePicker required={!settlement} onPick={pick} onCancel={() => setChanging(false)} />}
      {settlement && (
        <TextInput label="Cím" isOptional value={address} onChange={(v) => setAddress(v.slice(0, 500))} autoComplete="off" />
      )}

      {/* PROPOSAL copy. One control: a segmented row on wide screens, a stack of large rows under 640px (CSS only). */}
      <div className={css.field}>
        <span id="booking-kind-label">Foglalás típusa</span>
        <div className={css.kinds} role="group" aria-labelledby="booking-kind-label">
          {BOOKING_KINDS.map((k) => (
            <button key={k} type="button" aria-pressed={kind === k} className={css.kind} onClick={() => { setKind(k); setDays(21); }}>
              {BOOKING_KIND_LABEL[k]}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className={css.stack} aria-busy="true" aria-label="Keresés">
          <div className={css.skeleton} style={{ height: 330 }} />
          <div className={css.skeleton} style={{ height: 240 }} />
        </div>
      )}
      {searchError && <span className={css.err} role="alert">{searchError}</span>}

      {result && result.slots.length === 0 && (
        <div className={css.stack}>
          <span role="status">{days} napon belül nincs szabad időpont erre a helyszínre.</span>
          {days < 60 && <Button variant="secondary" label="Keresés 60 napra" onClick={() => setDays(60)} />}
        </div>
      )}

      {result && result.slots.length > 0 && (
        <>
          <MachineDayGrid rows={grid} slots={result.slots} probes={probes} selectedKey={selectedKey} keyOf={keyOf} onSelect={(s) => { setExtra(null); setCards(result.slots); setConflict(false); setSelectedKey(keyOf(s)); }} />
        </>
      )}

      {conflict && (
        <strong role="status">
          {allCards.length > 0 ? "Időközben megváltozott a nap, itt az új lehetőség:" : "Időközben megváltozott a nap, és nincs új szabad időpont. Válassz másik napot vagy helyszínt."}
        </strong> // PROPOSAL copy
      )}
      {allCards.length > 0 && (
        <div className={css.stack} role="group" aria-label="Javaslatok">
          {allCards.map((s) => {
            const rank = s === extra ? undefined : cards.indexOf(s) + 1;
            const m = machineOf(s.machineId);
            return (
              <SlotCard
                key={keyOf(s)}
                slot={s}
                rank={rank}
                selected={selectedKey === keyOf(s)}
                onSelect={() => setSelectedKey(keyOf(s))}
                baseName={m?.base.name ?? "Bázis"}
                machineName={machines.length > 1 ? m?.name : undefined}
                onPickBundle={pickBundle}
              />
            );
          })}
        </div>
      )}

      {settlement && allCards.length > 0 && (
        <div className={css.stack}>
          <Button
            variant="primary"
            size="lg"
            width="100%"
            label={selected ? `Foglalás: ${fmtDate(selected.startsAt)}` : "Foglalás"}
            isDisabled={!selected}
            isLoading={pending}
            onClick={() => selected && book({ startsAt: selected.startsAt, machineId: selected.machineId }, "main")}
          />
          {bookError?.from === "main" && <span className={css.err} role="alert">{bookError.msg}</span>}
          <span className={css.muted}>Csak elérhető időpontot mutatunk. Kézi időponthoz nyisd ki a Más időpont részt.</span>
        </div>
      )}

      {settlement && (
        <ManualTimeCheck
          // Remount on a new site or kind: drops a result checked for the old one, and any check still in flight.
          key={`${settlement.id}:${kind}:${siteSource}`}
          search={{ settlementId: settlement.id, kind, siteSource }}
          machines={machines}
          onBook={(a) => book(a, "manual")}
          pending={pending}
          bookError={bookError?.from === "manual" ? bookError.msg : null}
        />
      )}
    </section>
  );
}
