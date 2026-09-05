# Phase 1.5 UI inventory (Sonnet worker for Nate, 2026-09-04) — read before the readability pass

- Tailwind **v4**, CSS-first: `web/src/app/globals.css` (`@import "tailwindcss"` + `@theme inline`), no tailwind.config. Fonts via `next/font`: Inter → `--font-sans`, JetBrains Mono. **Base `html { font-size: 14px }` at globals.css ~line 203.** No root line-height.
- Tokens: `:root` lines 8-81 (`--fg`, `--fg-soft`, `--fg-mute`, `--fg-faint`; shadcn remap 42-74). `@theme inline` remaps the whole slate/gray palette to these tokens. Codebase uses `text-slate-*` (600 ×49, 400 ×34, 500 ×20), never `text-gray-*`.
- **Kanban:** `leads/LeadsKanban.tsx` grid `minmax(220px,1fr)` (line ~221), card padding `10px 12px`, title 13px, body 11px, meta 9-10px, **no horizontal scroll**. `deals/DealsKanban.tsx` same pattern at 240px. Shared column CSS `.kcol*` in globals.css ~398-440 (title 12px, count 11px).
- **Dialogs:** all 16 modals use shadcn `Dialog` (good). **No shared FormField exists.** 5 modals use `<div class="field-group"><label class="field-label">` (`.field-label` = 10px uppercase at globals ~569; `.field-group` has no CSS). The other ~11 hand-roll labels with ad-hoc classes/inline styles.
- **The real blocker for "bigger font": ~470 inline `style={{ fontSize: N }}` px literals** (12 ×141, 11 ×140, 13 ×97, 10 ×81, 9 ×7). Changing the base/token does NOT touch these. Worst files: CompanyDetailClient (28), CallCockpit (25), SettingsClient (24), dashboard page (22), PersonDetailClient (19), TasksKanban (14). Plus `text-xs` ×59 (TaskModal 14, tasks/[id] 9).
- Hex colors outside globals: 13 files, semantic status/tag palettes — out of scope.

## Implication for the plan
PR A (tokens+font): base 16px, root line-height 1.5, `.kcol*` sizes, kanban min-width 320px + `overflow-x:auto` wrapper, card padding 16px + title 16-17px. PR B: a `FormField` component + sweep the 16 dialogs. **PR C (or inside A): a scripted sweep replacing inline `fontSize` literals with a 4-step utility scale** (e.g. 9-11→13/14, 12-13→14, keep ≥14), otherwise most text stays tiny. Sonnet worker task, mechanical, review the diff.
