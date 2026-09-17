# Cold-email 4-touch framework

⚠️⚠️⚠️ **PLACEHOLDER FRAMEWORK — DO NOT SEND AS-IS** ⚠️⚠️⚠️
Péter's real Hungarian copy has not landed yet. Every Hungarian sentence below is a structural
stand-in so `cold-email-batch` has something to draft against — it is not approved wording.
Before any drafts from this file reach a real prospect, Áron/Péter must replace the ⚠️ lines and
supply:
- **the intro-PDF (lead-magnet) URL** — Áron owes this (also blocks `send_intro` on `/api/leads`,
  which needs `tenants.settings.introMaterialUrl`, see `docs/api.md`)
- **the landing-page URL** for touch 4
- **Péter's actual framework text** for touches 1–4

Used by `.claude/skills/cold-email-batch/SKILL.md`. Source of truth for structure:
`BRIEFING_2026-09-04.md`, ADDENDUM 2026-09-08, "The 4-touch schema" section.

## Rules that apply to every touch

- One question per email, never more.
- Never a calendar-booking link anywhere in the sequence (touch 3 proposes two slots as *text*).
- No pitch deck, no attachment, no pricing.
- Every email carries the tenant's consent/unsubscribe line
  (`tenants.settings.outreachFooter` — set at `/outreach`, not something this skill writes).
- Reference `27_qualification_model.md`'s **gate** question naturally — the goal of the whole
  sequence is to get *a reply*, which `reply-intake` turns into a qualified lead. Nothing here
  tries to close.

## Touch 1 — Apropó (no link)

Three short dossier lines (from the company's real data — Zoho account/deal/visit history, or
public site/news — never invented) that show you did your homework, then exactly **one**
question. No link, no attachment.

Structure:
```
[Line 1 — something specific and true about the company, e.g. an active project, a recent
 expansion, an industry fact tied to their scopeOfActivity/teaorDescription]
[Line 2 — a second concrete dossier fact]
[Line 3 — a bridge line connecting the facts to a concrete-scanning need]

⚠️ PLACEHOLDER: "Van most futó projektetek, ahol meglévő betonba kell fúrni vagy vágni?"
```

## Touch 2 — Case + reworded question

One attributed case study, then the *same* question from touch 1, reworded so it doesn't read as
a repeat. Still no link.

```
⚠️ PLACEHOLDER case line: "A GC Rieber-nél 600 m² felületet szkenneltünk át 2 óra alatt,
mielőtt bármit fúrtak volna bele."

⚠️ PLACEHOLDER reworded question: "Nálatok is előfordul, hogy fúrás/vágás előtt jó lenne
pontosan tudni, mi van a betonban?"
```

## Touch 3 — Ask for the call, propose slots (never a calendar link)

```
⚠️ PLACEHOLDER: "Megér tíz percet telefonon?"

Két javasolt időpont (szöveg, nem naptárlink):
- ⚠️ PLACEHOLDER slot 1, e.g. "Kedden 10:00"
- ⚠️ PLACEHOLDER slot 2, e.g. "Szerdán 14:00"
```

## Touch 4 — Breakup + lead magnet + landing link

```
⚠️ PLACEHOLDER breakup line, e.g. "Nem szeretnélek zavarni, ha most nem aktuális —"

⚠️ PLACEHOLDER lead-magnet line + URL: [INTRO PDF URL — Áron owes this]
⚠️ PLACEHOLDER landing line + URL: [LANDING PAGE URL]
```

## Reply routing (handled by `reply-intake`, not by this file)

Per the addendum: any reply becomes a lead via `POST /api/leads`. The reply's intent then decides
the next human action —

| reply reads as | routes to |
|---|---|
| warm (wants to talk now / asks logistics) | phone call |
| lukewarm (interested but non-committal) | send the qualification form link |
| "not now" | nurture pool |

This routing is a human/skill judgment call recorded in the lead's `message` field when the lead
is created — `docs/api.md` does not document a dedicated "intent" field or endpoint for it, so
don't invent one; see `reply-intake/SKILL.md` for exactly what gets posted.
