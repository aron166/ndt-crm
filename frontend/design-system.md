# NDT CRM — Design System

> Implementation-ready spec. The frontend agent must follow this exactly.
> Do not invent colors, spacing, or radii outside this system.

---

## Aesthetic

**Reference:** Linear (dark sidebar, minimal, data-dense) + Pipedrive (CRM structure, status-driven).
**NOT:** Generic SaaS blue. Card-everything layouts. Heavy shadows. Marketing gradients.
**Feel:** Industrial precision. A tool built for people who inspect steel with ultrasound — not a startup selling subscriptions.

---

## Color Palette

### Brand / Primary
Indigo — confident, precise, distinct from every competitor (Zoho red, HubSpot orange, Pipedrive green).

| Token | Hex | Use |
|---|---|---|
| `primary` | `#4338CA` | Buttons, active nav, links, focus rings |
| `primary-hover` | `#3730A3` | Button hover |
| `primary-light` | `#EEF2FF` | Subtle highlight backgrounds |
| `primary-fg` | `#FFFFFF` | Text on primary |

### Sidebar (dark shell)
| Token | Hex | Use |
|---|---|---|
| `sidebar-bg` | `#0F172A` | Sidebar background (slate-900) |
| `sidebar-border` | `#1E293B` | Sidebar internal borders |
| `sidebar-text` | `#94A3B8` | Nav item default text |
| `sidebar-text-active` | `#F1F5F9` | Active nav item text |
| `sidebar-item-active` | `#1E3A5F` | Active item background |
| `sidebar-item-hover` | `#1E293B` | Hover background |

### Content area
| Token | Hex | Use |
|---|---|---|
| `bg` | `#F8FAFC` | Page background |
| `bg-card` | `#FFFFFF` | Card / table row background |
| `border` | `#E2E8F0` | Default borders, table dividers |
| `border-subtle` | `#F1F5F9` | Very subtle separation |

### Text
| Token | Hex | Use |
|---|---|---|
| `text-primary` | `#0F172A` | Headlines, important data |
| `text-secondary` | `#475569` | Labels, secondary info |
| `text-muted` | `#94A3B8` | Placeholder, disabled, metadata |

### Semantic
| Token | Hex | Background | Use |
|---|---|---|---|
| `success` | `#059669` | `#ECFDF5` | Closed Won, active, confirmed |
| `warning` | `#D97706` | `#FFFBEB` | Pending, attention needed |
| `danger` | `#DC2626` | `#FEF2F2` | Errors, Closed Lost, overdue |
| `info` | `#0891B2` | `#ECFEFF` | Informational |

### Pipeline Status Badges (0–8)
Each badge uses `text-xs font-medium px-2 py-0.5 rounded-full`.

| Code | Label | Text | Background |
|---|---|---|---|
| `0` | KUKA | `#64748B` | `#F1F5F9` |
| `1` | NEM HÍVTUK | `#64748B` | `#F8FAFC` |
| `2` | HÍVTUK — NEM ÉRT. EL | `#B45309` | `#FEF3C7` |
| `3` | HÍVTUK — ÉRDEKEL | `#1D4ED8` | `#EFF6FF` |
| `4` | HÍVTUK — NEM KELL | `#B91C1C` | `#FEF2F2` |
| `5` | HÍVTUK — KELL | `#4338CA` | `#EEF2FF` |
| `6` | PENDING | `#92400E` | `#FEF3C7` |
| `7` | CL | `#991B1B` | `#FEE2E2` |
| `8` | CW | `#065F46` | `#ECFDF5` |

---

## Typography

**Font:** `Inter` for everything. Load from Google Fonts with `font-display: swap`.
**Monospace:** `JetBrains Mono` — use for VAT numbers, invoice numbers, serial numbers, IDs.

### Scale
Base is **14px** (not 16px). Data-dense UIs (Linear, GitHub, Notion) use 14px body. Set on `html`.

| Name | Size | Weight | Use |
|---|---|---|---|
| `text-xs` | 11px | 500 | Badges, metadata, table sub-labels |
| `text-sm` | 12px | 400/500 | Table cells, secondary text |
| `text-base` | 14px | 400 | Body default |
| `text-md` | 15px | 500 | Emphasized body, form labels |
| `text-lg` | 16px | 600 | Card titles, section headers |
| `text-xl` | 18px | 600 | Page section titles |
| `text-2xl` | 22px | 700 | Page titles |
| `text-3xl` | 28px | 700 | Dashboard KPI numbers |

Line height: `1.5` for body, `1.25` for headings.

---

## Spacing

4px base grid. Use multiples: `4, 8, 12, 16, 20, 24, 32, 40, 48, 64`.
Tailwind's default spacing scale works — just stick to it. No arbitrary values.

**Key layout dimensions:**
- Sidebar width: `240px` (fixed)
- Topbar height: `56px`
- Content max-width: `1280px`
- Page horizontal padding: `px-6` (24px)
- Card padding: `p-5` (20px)
- Table cell padding: `px-4 py-3`

---

## Border Radius

| Token | Value | Use |
|---|---|---|
| `rounded-sm` | 4px | Badges, small chips |
| `rounded` | 6px | Inputs, buttons, cards |
| `rounded-md` | 8px | Modals, dropdowns, panels |
| `rounded-full` | 9999px | Avatars, status dots |

---

## Shadows

Keep them subtle. This is a tool, not a landing page.

| Name | Value | Use |
|---|---|---|
| `shadow-card` | `0 1px 3px rgba(0,0,0,0.07), 0 1px 2px rgba(0,0,0,0.04)` | Cards |
| `shadow-dropdown` | `0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)` | Dropdowns, popovers |
| `shadow-modal` | `0 20px 40px rgba(0,0,0,0.12)` | Modals |

No shadow on tables. No shadow on sidebar items. No `shadow-xl` anywhere in the app.

---

## Component Rules

### Tables
- Sit directly on `bg` background — NOT wrapped in a card
- `border-b border-gray-100` on each row
- Header row: `bg-gray-50`, `text-xs font-medium text-slate-500 uppercase tracking-wide`
- Row hover: `bg-gray-50/60`
- No alternating row colors (zebra striping = 2000s)
- Sticky header on scroll for long tables

### Cards
- `bg-white border border-slate-200 rounded-md`
- `shadow-card` only — no heavy elevation
- Padding: `p-5`
- Section cards (on detail pages) use a subtle `text-sm font-semibold text-slate-700` title

### Sidebar
- Fixed left, `w-60`, full height, `bg-[#0F172A]`
- Logo/brand at top, `h-14`, `px-5`
- Nav section labels: `text-xs font-semibold text-slate-500 uppercase tracking-widest px-3 mb-1`
- Nav items: `h-9 px-3 rounded flex items-center gap-2.5 text-sm`
- Active: left border `border-l-2 border-indigo-500` + `bg-[#1E3A5F]` + `text-slate-100`
- Icons: Lucide, `size-4`, same color as text

### Buttons
- Primary: `bg-indigo-700 hover:bg-indigo-800 text-white rounded px-3.5 py-2 text-sm font-medium`
- Secondary: `bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded px-3.5 py-2 text-sm font-medium`
- Destructive: `bg-red-600 hover:bg-red-700 text-white`
- Ghost: `text-slate-600 hover:bg-slate-100`
- One primary CTA per page max

### Inputs
- `h-9 px-3 text-sm border border-slate-200 rounded bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500`
- Label above input, `text-sm font-medium text-slate-700 mb-1`
- Error: `border-red-400` + `text-xs text-red-600 mt-1`

### Badges (status, type labels)
- `inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium`
- Use the pipeline status color table above
- Never use background color alone — always pair with matching text color

### Empty States
- Centered, `py-16`
- Lucide icon at `size-10 text-slate-300`
- Title: `text-base font-medium text-slate-600`
- Subtitle: `text-sm text-slate-400`
- CTA button if applicable

---

## Tailwind Config Extension

```ts
// tailwind.config.ts
import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        sidebar: {
          bg: '#0F172A',
          border: '#1E293B',
          text: '#94A3B8',
          'text-active': '#F1F5F9',
          'item-active': '#1E3A5F',
          'item-hover': '#1E293B',
        },
        primary: {
          DEFAULT: '#4338CA',
          hover: '#3730A3',
          light: '#EEF2FF',
          fg: '#FFFFFF',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      fontSize: {
        xs: ['11px', { lineHeight: '1.5' }],
        sm: ['12px', { lineHeight: '1.5' }],
        base: ['14px', { lineHeight: '1.6' }],
        md: ['15px', { lineHeight: '1.5' }],
        lg: ['16px', { lineHeight: '1.4' }],
        xl: ['18px', { lineHeight: '1.4' }],
        '2xl': ['22px', { lineHeight: '1.3' }],
        '3xl': ['28px', { lineHeight: '1.2' }],
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.07), 0 1px 2px rgba(0,0,0,0.04)',
        dropdown: '0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)',
        modal: '0 20px 40px rgba(0,0,0,0.12)',
      },
      borderRadius: {
        DEFAULT: '6px',
        sm: '4px',
        md: '8px',
      },
    },
  },
  plugins: [],
} satisfies Config
```

---

## CSS Variables (shadcn/ui overrides)

```css
/* src/index.css */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 248 250 252;       /* #F8FAFC */
    --foreground: 15 23 42;          /* #0F172A */
    --card: 255 255 255;
    --card-foreground: 15 23 42;
    --popover: 255 255 255;
    --popover-foreground: 15 23 42;
    --primary: 67 56 202;            /* #4338CA indigo-700 */
    --primary-foreground: 255 255 255;
    --secondary: 241 245 249;        /* slate-100 */
    --secondary-foreground: 15 23 42;
    --muted: 241 245 249;
    --muted-foreground: 100 116 139; /* slate-500 */
    --accent: 238 242 255;           /* indigo-50 */
    --accent-foreground: 67 56 202;
    --destructive: 220 38 38;
    --destructive-foreground: 255 255 255;
    --border: 226 232 240;           /* slate-200 */
    --input: 226 232 240;
    --ring: 67 56 202;
    --radius: 0.375rem;              /* 6px */
  }

  html {
    font-size: 14px;
    -webkit-font-smoothing: antialiased;
  }

  body {
    @apply bg-slate-50 text-slate-900 font-sans;
  }
}
```

---

## What NOT to Do

- No `blue-500` or `blue-600` anywhere — that's the generic SaaS color
- No `shadow-lg` or `shadow-xl` on cards
- No gradient backgrounds on functional UI (only allowed on empty state illustrations)
- No zebra-stripe table rows
- No card wrapping around every piece of content — let tables breathe
- No `text-base` set to 16px — keep 14px as the body base
- No rounded-xl or rounded-2xl on cards — max `rounded-md` (8px)
- No border-radius on table rows
- No emoji icons — Lucide only
- No `any` colors outside this palette
