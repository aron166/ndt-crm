# ADR 002 — Person-Centric Data Model

**Date:** 2026-04-22
**Status:** Accepted

## Decision

Person and Contact are separate entities. Person = human being (persists). Contact = state (time-bound relationship between Person and Company).

## Context

Every existing CRM treats "contact" as the core entity. When a person changes employer, their history is lost or duplicated. This is wrong for relationship-heavy B2B industries like NDT.

In NDT, the same person (e.g. Kovács Béla) may work at multiple companies over a career. The relationship with that person — built over years — is the asset, not the contact record at a specific company.

## Decision

```
Person (entity)  ──── Contact (state) ──── Company (entity)
```

- **Person**: first/last name, personal email, personal phone, LinkedIn. Never deleted.
- **Contact**: role, work email, work phone, started_at, ended_at. ended_at=null means current.
- **Company**: organization data, VAT number as unique key.

When a person changes jobs:
1. Set `ended_at` on their current Contact record
2. Create a new Contact record for the new company
3. Person record is unchanged — all history stays attached

## Rationale

- Industry practitioners identified this as a gap in the market — no NDT CRM does this
- LinkedIn is the closest analogy — person profile persists across employers
- Interaction and task history stays attached to both Person and Company
- When querying "who do we know at Company X" — query active contacts
- When querying "what's our history with Kovács Béla" — query via person_id

## Consequences

- More complex data model than contact-centric CRMs
- Queries must always consider whether to filter by current contacts (ended_at IS NULL)
  or all historical contacts
- Never collapse Person and Contact into one table — this decision cannot be undone cheaply
