import { DEFAULT_TRANSITIONS, findTransition } from "./lifecycle";
import type { BookingKind } from "@/lib/booking/priority";

// One-click next steps for the lead page. Pure: the stage rules (DEFAULT_TRANSITIONS) give the
// target stage, this file only picks the human events in happy-path order and words them.

export type SuggestionKind = "move" | "booking" | "call" | "offer" | "email" | "signoff";

export interface Suggestion {
  key: string;
  label: string;
  kind: SuggestionKind;
  /** Stage event to run (a move now, or after the booking / offer succeeds). */
  event?: string;
  /** Target stage, resolved from the transition table. */
  to?: string;
  bookingKind?: BookingKind;
}

export interface SuggestionFacts {
  hasPhone?: boolean;
  hasEmail?: boolean;
}

type Spec = Omit<Suggestion, "to">;

// PROPOSAL copy: labels. Order = happy path first.
const SPECS: Record<string, Spec[]> = {
  new: [
    { key: "call", label: "Hívd fel", kind: "call" },
    { key: "book-survey", label: "Foglalj felmérő megbeszélést", kind: "booking", event: "call_meeting_booked", bookingKind: "job" },
    { key: "qualified", label: "Minősítve", kind: "move", event: "call_qualified" },
  ],
  discovery_booked: [
    { key: "meeting-fit", label: "Megbeszélés megvolt, alkalmas", kind: "move", event: "meeting_done_fit" },
    { key: "meeting-no-show", label: "Nem jelent meg", kind: "move", event: "meeting_no_show" },
  ],
  qualified: [
    { key: "send-offer", label: "Küldd el az ajánlatot", kind: "offer", event: "offer_sent" },
    { key: "book-demo", label: "Foglalj demót", kind: "booking", bookingKind: "single_machine_demo" },
  ],
  offer_sent: [
    { key: "book-demo", label: "Foglalj demót", kind: "booking", event: "demo_booked", bookingKind: "single_machine_demo" },
    { key: "offer-accepted", label: "Elfogadta az ajánlatot", kind: "move", event: "offer_accepted" },
    { key: "remind", label: "Küldj emlékeztető emailt", kind: "email" },
  ],
  demo_booked: [
    { key: "demo-done", label: "Demó megtörtént", kind: "move", event: "demo_delivered" },
    { key: "remind", label: "Küldj emlékeztető emailt", kind: "email" },
  ],
  demo_done: [
    { key: "ordered", label: "Megrendelte", kind: "move", event: "order_placed" },
    { key: "call-decision", label: "Hívd fel a döntésért", kind: "call" },
  ],
  ordered: [
    { key: "signoff", label: "Teljesítésigazolás aláíratása", kind: "signoff" },
    { key: "won", label: "Megnyerve, átadás", kind: "move", event: "order_won" },
  ],
  recall: [{ key: "call-again", label: "Hívd fel újra", kind: "call" }],
  lost: [{ key: "reopen", label: "Újranyitás", kind: "move", event: "lead_reopened" }],
};
SPECS.contacting = SPECS.new;

export function suggestNextSteps(stage: string, facts: SuggestionFacts = {}): Suggestion[] {
  const out: Suggestion[] = [];
  for (const spec of SPECS[stage] ?? []) {
    if (spec.kind === "call" && facts.hasPhone === false) continue;
    if (spec.kind === "email" && facts.hasEmail === false) continue;
    if (!spec.event) { out.push(spec); continue; }
    const t = findTransition(DEFAULT_TRANSITIONS, stage, spec.event);
    if (t) out.push({ ...spec, to: t.to });
  }
  return out.slice(0, 3);
}
