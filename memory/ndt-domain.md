# NDT Domain — Business Context

## What this product is

Helm CRM is purpose-built for NDT (non-destructive testing / anyagvizsgálat) companies. First tenant is Controllabor Kft., a Hungarian NDT inspection company owned by Péter. The software is also an asset — Controllabor can be sold with the CRM bundled, increasing sale value. Long-term: rent to other NDT firms as SaaS.

No purpose-built software exists for this vertical. Generic CRMs (Pipedrive, HubSpot, Monday) miss the NDT-specific needs listed below.

## Why person-centric matters here

The Hungarian NDT market is small and deeply relationship-driven. When Kovács Béla moves from Company A to Company B, the relationship doesn't reset — *he* is the relationship. Existing CRMs lose track of people at job changes. Helm doesn't. This is the core competitive differentiator.

## NDT billing cost codes

These map directly to the `task.cost_code` field (schema exists, UI pending). Every field task generates revenue and cost across these five components:

| Code | Name | What it covers |
|---|---|---|
| **KID** | Kiszállási díj | Travel compensation — per km, covers fuel + vehicle depreciation + technician travel time |
| **MRD** | Minimális rendelkezésre állási díj | Minimum mobilization / availability fee — fixed per site visit |
| **DOD** | Dokumentációs díj | Documentation fee — per documentation unit (report, certificate) |
| **SZD** | Személyzeti díj | Personnel fee — timed from arrival at geolocation to signed napló (work log) |
| **VIZSGALAT** | Vizsgálat | Per-unit inspection — maps to line items in the megrendelő (work order) |

Each code has both a **revenue line** (what the client pays) and a **cost breakdown** (wages, fuel, equipment wear). The task system makes this measurable and automatable.

## Position multiplier (for task costing)

Tasks are costed with a multiplier to capture opportunity cost of who does the work:

| Level | Multiplier |
|---|---|
| Base worker | 1× |
| Mid-level | 3× |
|  Owner/CEO | 5× |

Owner spending 10 hours on admin = 5× more expensive than it looks in the data.

## Pipeline status codes

`company.pipeline_status` uses these numeric codes (migrated from Zoho CRM):

| Code | Meaning |
|---|---|
| 0 | KUKA — dead, no value |
| 1 | NEM HÍVTUK — never called |
| 2 | HÍVTUK NO ANSWER — called, no answer |
| 3 | HÍVTUK INTERESTED — called, interested |
| 4 | HÍVTUK NOT INTERESTED — called, not interested |
| 5 | HÍVTUK WANTS IT — called, wants it |
| 6 | PENDING — in progress |
| 7 | CL — Closed Lost |
| 8 | CW — Closed Won |

## Key Hungarian terms

| Term | Meaning |
|---|---|
| anyagvizsgálat | Non-destructive testing (NDT) |
| megrendelő | Work order / client order |
| árajánlat | Quote / proposal |
| teljesítési igazolás | Completion certificate (required for invoicing) |
| helyszíni munkavégzési napló | On-site work log (signed by client) |
| számla | Invoice |
| Számlázz.hu | The invoicing platform Péter currently uses (manual — future integration target) |
| normaidő | Standard time estimate for a task |
| F.A. | Felszámolás Alatt — under liquidation (exclude from most queries) |
| TEÁOR | Hungarian industry classification codes (A–U), stored in `company.industry_code` |

## Speed as the strategic moat

40% of NDT contracts are won purely by speed of quoting (source: Balogh Dávid's book). Price, terms, and qualifications matter less than being first with a credible number. Every feature that saves Péter time in the quote-to-close flow compounds directly into won deals.

## Ecosystem role

This CRM is also the **central ledger for the whole Uphill Trade portfolio**. VeloQuote, BirdsView, CashFlow, and the agent team write into `app_events` and `conversations` via `/api/events` and `/api/conversations`. Person and company records here are shared infrastructure — when a BirdsView lead converts to an NDT client, they should be the same person record.
