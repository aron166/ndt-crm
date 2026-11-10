# Lead page v2 (Áron's binding brief, 2026-11-10)

Task owner: Nate. Base: direction A of the mockups (workspace inbox/kai/lead-page-mockups/, code in
~/Projects/crm-astryx-mockups/src/lead2/). Read docs/astryx-pattern-guide.md, including "Taste rules", before any code.

## Áron's words
Key lead data visible, everything else on demand behind "Részletes adatok". ONE clean timeline of every interaction
and history (calls, emails, stage changes, bookings, documents, the form) without bloat. At the top the current
situation: phase, what happened last, and SUGGESTED next steps as one-click actions ("Küldd el az ajánlatot",
"Állítsd Demó lefoglalva-ra", "Küldj emlékeztető emailt"), so anyone, or later an agent, can move the lead down the
pipeline "so a monkey could do it". Show only what is needed. Two modes: viewing (default: situation + next steps +
timeline) and calling (the call pad and logging appear behind the "Hívás" button). Booking = A's drawer with the type
picker; on the phone the types stack as a list. Smooth, calm, readable. Suggested actions come from the existing
stage rules (lib/leads/lifecycle.ts DEFAULT_TRANSITIONS), no AI calls.

## Layout (viewing mode, top to bottom)
1. Back link "Vissza a leadekhez".
2. Header: lead name (40px, the biggest thing), contact line (person, role, town), phone (tel: link) and email,
   quiet chips: stage label, tier, owner. Right side: ONE primary button "Hívás" (enters calling mode and dials
   on phones via tel:), and a "..." menu (Szerkesztés, Felelős módosítása, Lezárás, Törlés).
3. "Helyzet" card (the situation): stage label large, "Utoljára: <one line of the newest timeline item, relative
   time>", the next-step strip (existing NextStepStrip: next action + due, urgency colour on the left bar only).
4. "Javasolt lépések": 1 to 3 suggestion buttons from suggestions.ts. The first is the primary style, the rest
   outline. Each is ONE click: a stage move (moveLead with the event), or it opens the right flow (booking drawer
   with the kind preselected, the offers panel, the email dialog, calling mode, the sign-off page). Stage moves
   that need a reason (lost, recall) open the existing LeadMoveDialog instead of moving blind.
5. "Történet": ONE timeline, newest first, from timeline.ts: calls and other interactions, stage changes (audit /
   status history), bookings and open tasks with a date, offers and documents, and the form submission at the
   bottom. One compact row per item: small neutral icon, one-line title, muted meta (who, when). Notes collapse to
   2 lines with "Tovább". Show the newest 8, then "Korábbiak (N)". Empty state: "Még nincs esemény. Hívd fel:
   <phone>".
6. "Részletes adatok": one disclosure, closed by default. Inside: the key facts, Amit tudunk (qualification
   panel), Ajánlatok és dokumentumok (offers panel), open tasks.
Desktop: 7/5 split; left = Helyzet, Javasolt lépések, Történet; right = Részletes adatok (closed) and a short
5-fact card. Phone: one column, primary "Hívás" sticky at the bottom, the "..." menu in the header.

## Calling mode
"Hívás" switches the page to calling mode (URL ?mode=call so a refresh keeps it): the call pad (existing OutcomePad
3x2) and the required note field appear at the top under the header, with "Hívás rögzítése" (existing logLeadCall /
CallOutcomeModal path). "Időpontot kért" (IF) opens the booking drawer, it never books on its own. "Kész" leaves
calling mode. Nothing else on the page changes.

## Booking
A right drawer "Időpont foglalása" (full screen on the phone) holding the existing route-aware BookingPanel. The
type picker is a segmented control of the four bookingKind values on desktop and a stacked list of large rows on the
phone. The old "Foglalt meeting" date field and any second booking path are removed. After a successful booking the
suggestion's stage move runs (for example offer_sent + demo_booked event -> demo_booked).

## Suggestions (lib/leads/suggestions.ts, pure, unit tested)
`suggestNextSteps(stage, facts) -> Suggestion[]` (max 3), `Suggestion = { key, label, kind: "move" | "booking" |
"call" | "offer" | "email" | "signoff", event?, to?, bookingKind? }`, built from DEFAULT_TRANSITIONS rows whose `from`
is the stage, only human events (exclude sla_missed, attempts_exhausted, *_expired, *_twice, inbound_received,
recall_date_reached, lead_lost, lead_reopened, demo_followed_up, payment_reminded, offer_silent), mapped to Hungarian
labels (PROPOSAL copy), ordered by the happy path. Proposed per stage:
- new, contacting: Hívd fel (call); Foglalj felmérő megbeszélést (booking, event call_meeting_booked); Minősítve (move call_qualified)
- discovery_booked: Megbeszélés megvolt, alkalmas (move meeting_done_fit); Nem jelent meg (move meeting_no_show)
- qualified: Küldd el az ajánlatot (offer, then move offer_sent); Foglalj demót (booking)
- offer_sent: Foglalj demót (booking, event demo_booked); Elfogadta az ajánlatot (move offer_accepted); Küldj emlékeztető emailt (email)
- demo_booked: Demó megtörtént (move demo_delivered); Küldj emlékeztető emailt (email)
- demo_done: Megrendelte (move order_placed); Hívd fel a döntésért (call)
- ordered: Teljesítésigazolás aláíratása (signoff); Megnyerve, átadás (move order_won)
- recall: Hívd fel újra (call)
- won, lost: none (closed); lost shows "Újranyitás" (move lead_reopened)
Use the tenant's live stage labels (statuses) for "Állítsd X-re" wording where a label is shown.

## Timeline (lib/leads/timeline.ts, pure, unit tested)
`buildTimeline({ interactions, auditEntries, statusHistory, tasks, offers, documents, lead }) -> TimelineItem[]`,
`TimelineItem = { id, at, kind: "call" | "email" | "note" | "stage" | "booking" | "task" | "offer" | "document" |
"form", title, meta?, body? }`, newest first, de-duplicated (a stage change logged both in audit and status
history appears once).

## Rules
UI and read queries only: no migration, no schema change, no new server action unless an existing one cannot do
it (then stop and ask Nate). Tenant scoping on every new query. Keep the existing names and concepts. Taste rules
from the pattern guide. No emojis, no em dashes, PROPOSAL copy markers on new Hungarian strings.
