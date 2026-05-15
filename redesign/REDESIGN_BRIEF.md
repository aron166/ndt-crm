# Redesign Brief — Árpil / NDT CRM
**Prepared by Kai for Nate, 2026-05-12**

> Áron has shipped a complete, working React mockup of the CRM at `ndt-crm/redesign/`. The previous translation attempt landed the token layer but lost the bespoke industrial look. This brief explains why, and gives the exact path to fix it.

---

## TL;DR

- **What's done well:** the token layer is ported correctly. `web/src/app/globals.css` already maps the OKLCH palette to shadcn tokens AND remaps the standard Tailwind palette (slate, gray, indigo, green, etc.) to the dark industrial colors. That's the hard part.
- **What's missing:** the **component CSS** (~600 lines of bespoke classes in `redesign/styles.css` after line 80) and the **custom visualization components** (Sparkline, AreaChart, BarChart, Donut, Oscilloscope, StackBar, LiveClock). Those carry the *feel* — without them the pages look like generic shadcn dressed in dark mode.
- **The fix:** port the component CSS verbatim into `globals.css` under `@layer components`, build the viz components from the mockup's `ui.jsx`, then re-compose each page to mirror the mockup file. Don't refactor the mockup classes into shadcn primitives — that's where the previous attempt failed. Honor the mockup as the source of truth.

---

## Why the previous attempt failed

The reflex was: "translate `<div className="pipe-cell">` to a shadcn `<Card>` with Tailwind utility classes." That's wrong here. The mockup uses class names like `.pipe-strip`, `.pipe-cell`, `.kpi`, `.k-label`, `.k-value`, `.k-spark`, `.nav-item`, `.signal-bar`, `.command`, `.status-bar`, `.sb` — each tuned to a specific visual outcome (gradients, glows, animations, accent variables). Reaching the same outcome with raw Tailwind utility chains is a 3× larger effort *and produces a brittle result* because every adjustment requires re-eyeballing.

The bespoke CSS is the design system. It's already written, it works, and it's only ~600 lines. Just drop it in.

---

## What's already in place

✅ `web/src/app/globals.css` — full OKLCH token system + shadcn passthrough + remapped Tailwind palette + dot-grid background + scrollbars + focus states + the mount/sigpulse/pulseDot/drawIn animations.

✅ `web/src/components/layout/` — `AppShell.tsx`, `Sidebar.tsx`, `Topbar.tsx`, `StatusBar.tsx` skeletons exist.

✅ `web/src/components/ui/` — full shadcn primitives (avatar, badge, button, card, dialog, dropdown-menu, input, select, separator, skeleton, table, tabs, textarea).

✅ Pages exist: `web/src/app/(app)/companies/`, `persons/`, `tasks/`, plus the dashboard at `(app)/page.tsx`.

---

## What's missing — the gap to close

### Gap 1: Component-level CSS not ported (this is the big one)

`redesign/styles.css` lines 80–781 contain all the bespoke component styles: sidebar, topbar, status bar, pipe-strip, KPI cards, nav items, command palette, signal bar, mount animations, table styles, badges, buttons, person/company/task page layouts, kanban styles, modal styles. These haven't been brought into `web/src/app/globals.css`.

**Action:** copy lines 80–781 of `redesign/styles.css` into `web/src/app/globals.css`, wrapped in `@layer components { ... }`. Adjust only what conflicts with existing Tailwind utilities (rare). Don't refactor names. Don't split into modules yet — keep it one file so the design holds together visually.

### Gap 2: Custom viz components not built

The mockup's `redesign/ui.jsx` defines (`grep -n "^function\|^const.*=.*function" redesign/ui.jsx`):
- `Avatar` (seed-based color, online dot, label)
- `Badge` (tone variants — slate / amber / sky / coral / indigo / mint / violet)
- `PipelineBadge` (stage code badge with accent color from stage tone)
- `Sparkline` (SVG, animates draw-in, prop: data array)
- `AreaChart`, `BarChart`, `Donut`, `StackBar`, `Oscilloscope` (SVG-based, all without external chart libs)
- `LiveClock` (mono-font ticking clock, CET, used in status bar)
- `I` (icon map — minimal stroke icons)

**Action:** create `web/src/components/viz/` and port each as a TypeScript React component:
- `Sparkline.tsx`, `AreaChart.tsx`, `BarChart.tsx`, `Donut.tsx`, `StackBar.tsx`, `Oscilloscope.tsx`, `LiveClock.tsx`
- The `I` icon map → `web/src/components/icons.tsx` (or use lucide-react equivalents where possible; mockup icons are minimal and consistent, so keeping them is fine)
- `Avatar` and `Badge` already exist in shadcn — augment them to support the mockup's tone variants instead of replacing
- `PipelineBadge` already exists as `PipelineStatusBadge.tsx` — verify it matches the mockup's visual treatment

These are SVG-only, no libraries. Each is 30–80 lines. Total porting effort: ~half a day.

### Gap 3: Page compositions don't match mockup fidelity

The pages exist but don't compose the elements the way the mockup does (KPI strip + PipelineStrip + activity feed + sparkline charts for dashboard; specific table layouts; specific empty states).

**Action:** for each page, open the mockup file side-by-side with the current Next.js page and re-compose to match. The data shape and server actions already work — this is purely a visual / structural rewrite of the JSX.

| Mockup file | Target Next.js file |
|---|---|
| `redesign/shell.jsx` | `web/src/components/layout/Sidebar.tsx`, `Topbar.tsx`, `StatusBar.tsx`, `AppShell.tsx` |
| `redesign/dashboard.jsx` | `web/src/app/(app)/page.tsx` |
| `redesign/companies.jsx` | `web/src/app/(app)/companies/page.tsx` + `[id]/page.tsx` |
| `redesign/persons.jsx` | `web/src/app/(app)/persons/page.tsx` + `[id]/page.tsx` |
| `redesign/tasks.jsx` | `web/src/app/(app)/tasks/page.tsx` |

Adapt — don't lift verbatim. The mockup uses `window.X` global pattern + mock data; the Next.js version uses ES imports + real server actions. Same visual outcome, different wiring.

---

## The correct sequence

Don't try to do this in one branch. Each phase has its own PR and a visual acceptance check.

### Phase 1 — Component CSS layer (1 PR, no UI changes yet)
Branch: `feature/redesign-component-css`

- Copy lines 80–781 of `redesign/styles.css` into `web/src/app/globals.css` under `@layer components`
- Run dev server, verify nothing breaks
- Take screenshots of current pages — they should look slightly different (now-styled where existing class names match) but no regressions

**Acceptance:** dev server runs clean; no Tailwind compilation errors; existing pages render without missing styles.

### Phase 2 — Shell fidelity (1 PR)
Branch: `feature/redesign-shell`

Rebuild `Sidebar.tsx`, `Topbar.tsx`, `StatusBar.tsx`, `AppShell.tsx` to match `redesign/shell.jsx` exactly:
- Sidebar: brand mark SVG + "Árpil" + tenant line + NAV groups with badges
- Topbar: breadcrumbs + command palette (Cmd+K hint) + signal bar + bell + primary "+ New" button
- Status bar: Supabase live indicator + Trigger.dev backlog + overdue tasks + CET zone + live clock + version + git branch
- Use the bespoke CSS classes from Phase 1; lean on the existing shadcn primitives only for accessibility (button focus, dropdown menus)

**Acceptance:** side-by-side visual match with `redesign/goal.png` for the shell chrome. The dot-grid + sidebar tint + status bar must read identical at a glance.

### Phase 3 — Viz components (1 PR)
Branch: `feature/redesign-viz`

Port `Sparkline`, `AreaChart`, `BarChart`, `Donut`, `StackBar`, `Oscilloscope`, `LiveClock` from `redesign/ui.jsx` into `web/src/components/viz/`. Add to the icon map if needed. Update `Avatar` and `Badge` shadcn variants to support the mockup's tones.

**Acceptance:** isolated test page (`/dev/viz`, gated by env) renders each viz component with sample data identical to the mockup.

### Phase 4 — Page-by-page port (one PR per page)

In order — dashboard first because it stresses everything:

1. **Dashboard** (`(app)/page.tsx`) — KPI strip with sparklines + PipelineStrip + recent activity + sparkline charts. Visual reference: `redesign/dashboard.jsx`. Use real data from server actions where the mockup uses `MOCK.X`.
2. **Tasks** (`(app)/tasks/page.tsx`) — list + kanban toggle (the kanban view is Step 4 work; for now just list with the bespoke styling). Visual reference: `redesign/tasks.jsx`.
3. **Companies** (`(app)/companies/page.tsx` + `[id]/page.tsx`) — list + detail. Visual reference: `redesign/companies.jsx`.
4. **Persons** (`(app)/persons/page.tsx` + `[id]/page.tsx`) — list + detail. Visual reference: `redesign/persons.jsx`.

**Acceptance per page:** side-by-side visual match with the mockup screenshot. Compare against `redesign/goal.png` / `goal1.png`. If the visual feels off, the gap is almost always either (a) a missing class because the CSS wasn't fully ported, or (b) a missing viz component.

---

## Hard rules

- **Don't refactor the mockup CSS into Tailwind utility chains.** The mockup is the source of truth and it works as written.
- **Don't introduce a chart library** (Recharts, Chart.js, Visx). The mockup is SVG-only and intentional. Match it.
- **Don't change the data shape** to fit the mockup. The mockup's `MOCK` is fake — adapt the mockup's component to consume real data from the existing server actions.
- **Don't ship a page port without a screenshot diff** in the PR description. Visual fidelity is the acceptance criterion.
- **The token layer is done — don't re-touch it.** Lines 1–289 of current `web/src/app/globals.css` are correct.
- **Follow VERSION_CONTROL.md** — one branch per phase, PR-per-phase, STATUS.md log entry per merge.

---

## Where this slots into the broader plan

Insert as **Step 3.7 — Redesign pass (visual fidelity to Árpil mockup)** in `STATUS.md`. Runs in parallel with Step 3 (Interactions) work to the extent both touch different files. If conflicts arise, the redesign yields and lands after Step 3 ships, because the redesign is structural (it doesn't gate other functional steps), and Step 4 (kanban) is going to want a clean visual foundation to build on top of.

## Open questions for Áron

1. **"Árpil" as the in-app brand name** — confirmed? (The shell hardcodes "Árpil" + "NDT · Controllabor" — this is what users see.)
2. **"Ask Árpil" AI tab in nav** — placeholder, or actually building this soon? If placeholder, leave the nav item but link to a `/coming-soon` page.
3. **Inbox / "Briefing" nav item** — what is this in practice? Morning summary page? Defer build, keep nav placeholder?
4. **Pipeline page** — currently the dashboard has a PipelineStrip; the mockup's nav has a separate "Pipeline" entry. Are these the same or different? Likely the dedicated `/pipeline` page is the deals kanban (Step 4) and the dashboard's PipelineStrip is just a summary.
