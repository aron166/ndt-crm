# Feature inventory + cut list — 2026-09-04 (Kai, read-only audit; Áron decides)

**Áron's ruling (2026-09-04): delete Equalizer ONLY. Everything else HOLD.**
Díjszabás (`/rate-card`) judged not useful, but `CostRate` feeds task costing + quote line
prices — keep until the future auto-quote replaces it. Later roadmap (not now): árajánlat
(quotes) pulls lead/contact/company data → szerződés (auto contract generation) → Stripe
payment-link generation → auto-quote engine.

Deletion PR by Nate AFTER Phase 1 merges. Áron strikes/keeps each line.

## Tier 1 — delete, no dependents
- [ ] Equalizer (`/equalizer`, `lib/equalizer/calc.ts`, test) — isolated, untouched since 2026-06-08
- [ ] Enrichment page + Google Maps (`/enrichment`, `actions/enrichment.ts`, `lib/integrations/google_maps.ts`, models `EnrichmentRun`/`EnrichmentProposal`) — 2026-05-13, never configured. Enrichment moves to the Claude Code skill (Phase 2b).
- [ ] Analytics + Invoices pages (`/analytics`, `/analytics/invoices`, `/invoices`) — 2026-05-13, page-inline Prisma, read-only; keep `Invoice` model only if ETL still writes it
- [ ] 4 placeholder integration cards: google_calendar, twilio, szamlazz, nav (no lib module)
- [ ] Dead models: `Equipment`, `Proposal`, `Agent` (coordinate with `etl/prisma/schema.prisma`)
- [ ] Legacy service-role key path (`lib/service-auth.ts`) — also Codex Batch A #3

## Tier 2 — probably delete (Áron's call)
- [ ] Marketing content queue (`/marketing`, `/marketing/[id]`, `POST /api/content`, models `ContentItem`/`ContentAsset`) — external "content factory" producer never built
- [ ] Marketing campaigns + audiences (`/marketing/campaigns*`, `Campaign` model, `lib/marketing/audience*`) — cannot send; Phase 2b `/outreach` replaces it. Salvage: audience-from-SavedView logic.
- [ ] Call cockpit (`/calls`, `actions/outreach.ts`, `lib/outreach/queue.ts`) — overlaps lead board v2 call-outcome logging. Option: fold into board as "call view".

## Keep (unused today, needed soon)
- Quotes builder + rate card (quote moat, post-machine)
- Import wizard (Péter's data) — **must be browser-tested; no record it ever ran**
- Hub ingestion `/api/events`, `/api/conversations` (portfolio ledger)
- `POST /api/calls/result` + `lib/calls/*` (voice-memo seam, Phase 3)
- Everything else in the "high" column of the audit (leads, deals, tasks, companies, persons, interactions, tags, search, audit, automations, email, settings, auth)

## Audit table (agent output, verbatim)
See session transcript 2026-09-04; key facts: 17 sidebar routes; last STATUS entry 2026-06-18;
models with zero web refs: Equipment, Proposal, EtlRun, Agent; API routes with no in-repo caller:
/api/content, /api/events, /api/conversations, /api/calls/result.
