# Astryx redesign pattern guide (direction A, light)

For every worker converting a screen. Reference screens (live on dev): `/leads` (call queue),
`/leads/[id]` (call sheet). Read `web/src/app/(app)/leads/queue/QueueRow.tsx` and
`web/src/components/astryx/` before you start.

## The look
Light, quiet, readable. One big title per page, a calm segmented control for views and filters,
lists that read like a calendar day (urgency bar on the left, what, detail, when, one action),
cards for summaries. Status is a word plus colour, never colour alone. States stay editable
where they were editable.

## The kit (use it, do not copy it)
- `@/components/astryx/PageHeader`: `PageHeader({ title, eyebrow, help, views, actions, filters })`
  and `Seg({ items, current, label })` (segmented links; the URL is the state).
- `@/components/astryx/page.module.css` (import as `k`): `row` + `bar` + `cell` + `cellEnd`
  (calendar-like list row; `data-u="overdue" | "today" | "done"` colours the bar), `group`,
  `groupHead`, `groupTitle`, `name`, `nameLine`, `strong`, `meta`, `time`, `muted`, `num`,
  `table` + `tableWrap` (dense data), `cards` + `card` + `cardMuted` + `stat`/`statK`/`statV`,
  `split` + `section` + `h2` + `kv` + `back` (detail pages), `btn` + `btnPrimary` + `link`,
  `empty`, `pager`.
- Astryx components: `Badge` (`@astryxdesign/core/Badge`, `<Badge variant="neutral|success|error|warning|blue|..." label="..." />`),
  `Button` (`@astryxdesign/core/Button`, `label`, `variant`, `size`, `href` or `onClick`).
- Tokens only from Astryx: `--color-text-primary|secondary|accent|error|success|warning`,
  `--color-background-card|muted|body`, `--color-border`, `--color-border-emphasized`,
  `--color-accent`, `--color-on-accent`, `--color-overlay-hover`, `--radius-element|container`,
  `--shadow-low|high`. A screen-specific `x.module.css` next to the page is fine for layout
  the kit lacks; it uses the same tokens.

## Rules for a converted screen
1. Page title: `<PageHeader>`; counts go in `eyebrow` or the title, never a 20px inline h1.
2. Filter pill rows: `<Seg>` with the same hrefs the old links had.
3. Lists of things with a date: `k.row` rows. Tables only where columns really compare numbers.
4. Inline `style={{ ... var(--fg-mute) ... }}` on the touched JSX: replace with kit classes or
   Astryx tokens. Do not leave `var(--bg-*)`, `var(--fg*)`, `var(--indigo*)`, `var(--line*)` in
   the files you touch. (A global bridge already maps them, so untouched files still look right.)
5. Text: 14px minimum for body, 12px only for labels. Tap targets 40px+ (44px on phones).
6. Works at 390px: no horizontal page scroll; tables sit in `k.tableWrap`.

## Never change (UI-only redesign)
Data fetching (Prisma queries, `where`, `take`, `orderBy`), server actions and their calls, auth
and tenant scoping, routes and search params, props passed between server and client components,
form field names, modals' logic, tests' expectations. No migrations, no new dependencies.
Hungarian copy: keep the existing strings; any NEW string gets a `// PROPOSAL copy` comment.
No emojis, no em dashes anywhere.

## Taste rules (Áron, 2026-11-10, binding for every screen and every work order)
"company page and other pages still have old style popups and colory shit, have some taste; I want a seamless
easy-to-use UI everywhere, it really is important, Péter is not good with tech."
1. Calm, restrained palette: neutral greys plus ONE accent for primary actions. Colour only for meaning (error,
   warning, success), sparingly, and then as a small dot or a short word, not a coloured block. No rainbow initials
   avatars (company and person initials are neutral or left out). No multi-colour status chips: a status is a quiet
   neutral chip, at most with a small dot. No monospace chips.
2. Zero old-style popups: every modal, dialog, drawer and confirm is on the design layer (components/ui Dialog,
   Button, Input, FormField) and reads only --ui-* tokens from web/src/styles/tokens.css.
3. Usable by a non-technical person: big clear labels, ONE obvious primary action per screen, plain Hungarian
   words, fewer choices visible at once (secondary actions behind a "..." menu or a "Részletes adatok" disclosure),
   and the same button placement on every page (primary action top right of the header; in dialogs: Mégse left
   of the primary, primary last).
