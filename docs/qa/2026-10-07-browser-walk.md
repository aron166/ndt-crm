# Browser QA walk, 2026-10-07

Live build https://ndt-crm.vercel.app, read-only, headless Chromium (agent-browser, session crmqa), logged in as the CRM user via a minted session cookie (deleted afterwards). Viewports 1366x768 and 390x844. Screenshots in `docs/qa/2026-10-07/` as `<page>-desktop.jpg` and `<page>-phone.jpg` (`/` is `home`, slashes become dashes).

Scope notes
- Dark theme only. The theme toggle persists to the users row through a server action (a write), so it was not used. Light mode is not covered.
- No console errors, no page errors and no 4xx/5xx requests on any of the 14 pages at either size.
- No horizontal page overflow on phone (scrollWidth equals clientWidth everywhere). Tables and the kanban scroll inside their own containers.
- No emoji in rendered UI text except the warning sign inside a commit title on /patchnotes (GitHub data).
- Load = browser `loadEventEnd` in ms (desktop / phone). "Unnamed" = visible interactive elements with no accessible name.

## Per-page table

| Page | Interactive (d/p) | Unnamed | Load ms (d/p) | Raw text, dash, emoji | Notes |
|---|---|---|---|---|---|
| / | 48 / 47 | 2 | 1467 / 2681 | none | 2 icon buttons unnamed (F3) |
| /leads | 41 / 40 | 2 | 2001 / 1086 | TODO placeholder, "— aron" | filter chip captions overlap the board (F4), TODO text (F5) |
| /leads/setup | 104 / 103 | 25 | 1052 / 818 | TODO script names | 23 trash buttons unnamed (F3), TODO scripts (F5) |
| /persons | 133 / 132 | 2 | 1818 / 733 | one en dash | phone: toolbar crowded, table scrolls inside |
| /tasks | 35 / 34 | 2 | 1052 / 710 | none | 0 open tasks, clean |
| /outreach | 63 / 62 | 2 | 1019 / 655 | 10 en dashes | clean |
| /outreach/campaigns | 30 / 29 | 2 | 1146 / 541 | one en dash | clean |
| /marketing | 107 / 106 | 2 | 1062 / 728 | 9 em dashes, raw keys | `plain_text_email` chips and Formátum filter keys (F6), em dashes in titles (F7) |
| /marketing/decisions | 110 / 109 | 2 | 789 / 329 | none | clean |
| /marketing/1 | 34 / 33 | 2 | 958 / 339 | none | title lacks accents: "Miert a GPR a betonszkenneles jovoje" (content, F8) |
| /reports/weekly | 26 / 25 | 2 | 573 / 384 | none | clean |
| /patchnotes | 345 / 344 | 2 | 1019 / 600 | warning sign, em dashes, "nan" in words | commit titles are GitHub data, English in a Hungarian UI |
| /automations | 32 / 31 | 2 | 1008 / 307 | none | clean |
| /drive | 13 / 13 | 0 | 1366 / 584 | "— aron", TODO option | em dash in UI (F7), TODO scripts (F5) |

Contrast: no failing text seen in the screenshots. Faint grey captions on the dark background (column hints, "Utolsó jegyzet", status bar) are low but legible; not measured.

## Assistant drawer on /marketing

- Launcher on phone: bottom right, y 720-764 of 844, labelled "Asszisztens, 34 Önre váró anyag". The status bar is `display: none` on phone, so nothing covers it. OK.
- Q1 "Mi vár rám?" answered: "34 anyag vár Önre, és 16 nyitott döntés." plus 5 lines `#id title, status, reason, /marketing/id` (assistant-q1-phone.jpg, assistant-desktop.jpg). No action cards appeared; the answer is a plain text list.
- Q2 "Mi van a vázlatokban?" did not get an answer: three attempts (phone, phone after 70 s, desktop) returned the red message "Pillanat, túl sok kérés. Kérem, próbálja újra egy perc múlva." although `POST /api/assistant/chat` returned HTTP 200 (assistant-q2-phone.jpg, assistant-q2-desktop.jpg). Possibly the limiter or upstream model. So action cards were never exercised.

## Findings

### P1 broken
None found.

### P2 wrong
- F1. Assistant says "(adat hiányzik)" as the title of #31 and #30, but /marketing/31 renders a real title ("Market Építő: Herencsár Zsolt ..."). The tool result drops the title for some rows. assistant-q1-phone.jpg
- F2. Assistant rate limit message fires on the second question within about 2 minutes and keeps firing 70 s later; the HTTP status is 200 so monitoring will not see it. Needs a look at the limiter window and the error status. assistant-q2-phone.jpg
- F3. Drawer layout. Phone: the drawer header (title, "Új beszélgetés", "Törlés", "Bezárás") is partly under the top bar, "Bezárás" is half cut. Desktop: the composer and "Küldés" button are cut by the status bar at the bottom. assistant-open-phone.jpg, assistant-desktop.jpg
- F4. /leads at 1366: the filter chip captions ("Gépérdeklődő", "Céges", "Szakember", "Magánszemély", "munka") overflow below the chip row and collide with the board column headers. leads-desktop.jpg
- F5. Unnamed icon buttons: 2 on every page (sidebar collapse, a topbar icon button) and 23 trash buttons on /leads/setup. They have no aria-label. leads-setup-phone.jpg, home-desktop.jpg
- F6. Placeholder script text "TODO: A változat (kérdéssel nyit)" and "TODO: ide jön az A szkript szövege" is shown in /leads/setup, the /drive script dropdown and the /leads column hint. It is seed data from migration 20260907150000_lead_status_description. leads-setup-phone.jpg, drive-desktop.jpg

### P3 polish
- F7. Raw keys in UI: `plain_text_email`, `phone_script`, `one_pager`, `process_doc`, `signature_block` as card chips and in the Formátum filter. marketing-desktop.jpg
- F8. House law, em dashes in UI: "— aron" under the lead name on /drive and /leads cards, and "Betonszabó — hideg levél, 1. érintés" style titles on /marketing (content). drive-desktop.jpg, marketing-desktop.jpg
- F9. /marketing/1 title and body are unaccented ("Miert a GPR a betonszkenneles jovoje"); content issue. marketing-1-desktop.jpg
- F10. /marketing phone: tab bar clips "Döntések" to "Dönt". marketing-phone.jpg
- F11. /persons phone: toolbar buttons wrap ("Tag szűrő" on two lines) and one icon button is empty. persons-phone.jpg
- F12. /patchnotes shows English commit titles in a Hungarian UI and a warning sign from a commit title. patchnotes-desktop.jpg
