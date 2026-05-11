# Frontend Session Context — NDT CRM

> This file layers on top of the root `CLAUDE.md`. Read that first for project overview, data model, naming conventions, and non-negotiables.

## Role

You are a senior React developer on this project. Pick the next `[ ] NEXT` task below and execute it completely, following all patterns in this file and the root CLAUDE.md.

**At the start of every session:** read `/STATUS.md` to see which backend APIs are ready before building pages that consume them.
**At the end of every session:** update `/STATUS.md` — what you completed, what's next, any backend APIs you're now waiting on.

---

## Design System

**Read `design-system.md` before writing a single line of UI.** It defines the full color palette, typography, spacing, component rules, Tailwind config, and CSS variables. Do not invent values outside it.

Summary of non-negotiables:
- Primary color: `#4338CA` (indigo-700) — NOT blue-500, NOT blue-600
- Base font size: 14px on `html` — data-dense like Linear/GitHub
- Sidebar: `#0F172A` dark, 240px fixed
- Tables: no card wrapper, no zebra stripes, `border-b` rows only
- Shadows: `shadow-card` max on cards — no `shadow-lg` anywhere
- Icons: Lucide only — no emoji
- Pipeline badges: use the exact color pairs from design-system.md

---

## Stack & Patterns

| Concern | Tool | Notes |
|---|---|---|
| UI components | shadcn/ui + Tailwind CSS | No inline styles — Tailwind classes only |
| Server state | @tanstack/react-query | Never `useState` for API data |
| Data tables | @tanstack/react-table | Server-side pagination always |
| Routing | react-router-dom v6 | Lazy-load every page route |
| HTTP | axios (src/lib/api.ts) | Auth header injected via interceptor |
| Types | `../../shared/types/index.ts` | Import from shared — never re-define |

## Hard Rules

- **No `any` in TypeScript.**
- **No inline styles** — Tailwind utility classes only.
- **All list views use server-side pagination** — pass `page`, `pageSize`, search, filters as query params.
- **All API data via react-query** — no local state for remote data.
- **Auth token injected globally** in the axios instance interceptor — never pass it per-request.
- **Person detail is LinkedIn-style** — employment history, interaction timeline, persistent across companies.
- **Protected routes** wrap everything except `/login`.

## File Structure

```
src/
├── components/        shared UI components (Button, Modal, Table wrappers, etc.)
├── pages/             one file per route
├── hooks/             custom hooks (useCompanies, useTasks, etc.)
├── lib/
│   ├── api.ts         axios instance + interceptors
│   └── utils.ts       formatHUF, formatDate, etc.
└── types/             frontend-only types (if any; prefer shared/types)
```

## API Client Pattern (`src/lib/api.ts`)

```ts
const api = axios.create({ baseURL: import.meta.env.VITE_API_URL + '/api' });
api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});
```

## React Query Pattern

- Query keys: `['companies', filters]`, `['person', id]`, etc.
- Mutations invalidate the related list query on success.
- Error boundaries at page level — not per-component.

## HUF Formatting

Always format amounts: `new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', maximumFractionDigits: 0 }).format(amount)`

---

## Task List

Mark tasks `[x]` when done. Move `NEXT` label to the following task.

### Phase 1 — Foundation

- [x] Configure Vite + TypeScript + ESLint + Tailwind CSS + shadcn/ui init; verify `npm run dev` runs clean
- [x] `src/lib/api.ts` — axios instance with base URL from `VITE_API_URL`, Bearer token interceptor
- [x] Auth: `LoginPage`, `AuthContext` + `useAuth` hook (token in localStorage), `ProtectedRoute` wrapper
- [x] App shell: `AppLayout` — collapsible sidebar nav + topbar with user menu
- [x] React Router v6 setup — lazy routes for all pages, redirect `/` → `/dashboard`

### Phase 2 — Core Pages

- [x] **Companies list** — searchable table (name, VAT, city, status), pagination, `pipelineStatus` badge, link to detail
- [x] **Company detail** — tabbed: Overview / Contacts / Deals / Tasks / Interactions / Invoices
- [x] **Persons list** — search by name/email, table with current company column
- [x] **Person detail** — LinkedIn-style: header card, employment history timeline, interaction log, linked tasks

### Phase 2.5 — Quote Feature (CURRENT PRIORITY)

**Context:** End-to-end automated quote pipeline. Inbound email → auto-reply with intake link → client fills chatbot form → backend pre-generates quote → Péter reviews in CRM → approves → PDF + Excel sent. Speed is the competitive moat.

**Backend APIs this phase needs (check STATUS.md before building):**
- `POST/GET/PATCH /api/quotes`, `POST /api/quotes/:id/approve`, `POST /api/quotes/:id/preview`
- `GET /api/price-catalog?year=2026`
- `POST /api/public/intake`, `GET /api/public/intake/schema`

- [ ] **NEXT: Public intake page** (`/intake` — no auth, no AppLayout) — chatbot-style multi-step form; steps: (1) contact info, (2) company name/VAT, (3) what needs testing + quantity, (4) location + date, (5) service type checkboxes, (6) technology checkboxes, (7) documentation checkboxes, (8) confirmation; POST to `/api/public/intake` on finish; show thank-you screen; responsive, clean, usable on mobile
- [ ] **Quotes list page** (`/quotes`) — table with columns: quote number, company, subject, status badge, issued date, total HUF, actions; filter by status + date range; link to detail
- [ ] **Quote detail page** (`/quotes/:id`) — two-panel layout: left = header info (recipient, dates, subject, status); right = line items table grouped by fee group (MRD/KID/SZD/VID/DOD); editable qty + discount per row; running total; "Approve & Send" button (calls approve endpoint); "Preview PDF" button; status timeline

### Phase 3 — Remaining CRM Pages (resume after quote feature)

- [ ] **Tasks page** — list view with filters (status, assignee, category, due date range); inline status toggle; subtask expand
- [ ] **Deals pipeline** — kanban board grouped by stage; drag-to-move stage; deal card shows company + value
- [ ] **Leads queue** — list with assign dropdown, status badge, bulk status update
- [ ] **Invoices page** — table with year filter, HUF formatting, link to company
- [ ] **Equipment page** — table; calibration due date highlighted red if within 30 days

### Phase 4 — AI + Dashboard

- [ ] **Dashboard** — today's tasks for current user (ordered), pipeline stage counts, recent interactions feed
- [ ] **AI query page** — text input → `POST /api/ai/query` → render structured results
- [ ] **Morning briefing** — `GET /api/ai/briefing` → Jarvis-style ordered task list for the day
