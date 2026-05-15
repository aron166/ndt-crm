# Current Sprint — Helm CRM

Last updated: 2026-05-14

## Active branch

`feature/enrichment-engine` — LLM-assisted company/person data enrichment with Groq + human review UI. Schema: `EnrichmentRun`, `EnrichmentProposal`. PR open or ready to merge to `dev`.

## Last shipped (merged to dev)

| PR | What |
|---|---|
| #9 | Dashboard polish — stat strip + pipeline bar |
| #8 | Vercel deploy prep — build passes clean (0 TS errors, 20 routes) |
| #7 | Google Maps + custom fields + person-left-company + EntitySearch fix |
| #6 | Dashboard, invoices page, settings + integrations infrastructure |
| #5 | Helm CRM rename + saved views on companies & persons |
| #4 | UX polish — borderless tables, relative time, tighter columns |
| #3 | Perf — loading.tsx, pulse animation, pool idleTimeout |
| #2 | Ecosystem hub — agents/conversations/messages/app_events + ingestion API |
| #1 | Analytics drill-through — revenue KPI → /analytics/invoices, cold companies → /companies |

## Next up (priority order — confirmed with Áron)

1. **Complete task → log interaction in one step** — when completing a call/meeting/email task, pop a modal to log outcome simultaneously. Only triggers for interaction-type tasks (call, email, meeting, site_visit). Highest-frequency daily action for Péter.
2. **CSV/Excel import** — upload companies or contacts in the UI. Péter can add clients without touching code.
3. **Gmail sync** — OAuth connect, auto-log sent/received emails as interactions. Settings → Integrations placeholder already exists. **Both channels required from day 1:** `info@` AND `peter.z.nagy@`.
4. **Google Calendar sync** — meetings → interactions, tasks → calendar events.
5. **Automations rule engine** — "when deal sits in stage X for N days → create follow-up task". Ecosystem hub event bus (Step 5) already provides the backbone.
6. **NDT cost codes UI** — KID/MRD/DOD/SZD/VIZSGALAT dropdown on task form. Schema column `cost_code` already exists on `tasks`.
7. **Quote intake page** — public `/intake`, no auth, client submits → feeds pipeline.
8. **Google Maps distance calc** — KID travel cost auto-fill from geocoded company address to Controllabor HQ.

## Deferred (don't touch yet)

- Step 4.5 — Skill/equipment precondition engine (schema stub `skill_required_id` is on tasks)
- Számlázz.hu invoice trigger (needs their API + field service tracking first)
- Geolocation 100m trigger (needs mobile/PWA surface first)
- Smart glasses integration (TRL 2, not in 2026 scope)

## Blocking / needs Áron

- Vercel env vars need to be set manually (see checklist in BRIEFING_2026-05-12.md)
- Supabase redirect URL for auth needs to be updated to prod URL after Vercel deploy
