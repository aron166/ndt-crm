---
title: NDT CRM/ERP — Operational Software for NDT Companies
type: project
status: active
confidence: medium
last_updated: 2026-04-22
sources: [raw1.md, raw3.md, raw7.md, raw8.md]
---

# NDT CRM/ERP — Operational Software for NDT Companies

## What It Is

A purpose-built CRM/ERP system for non-destructive testing (anyagvizsgálat) companies. Designed to handle the full operational lifecycle: client relationships, field work management, quoting, reporting, invoicing, scheduling, and accreditation tracking. Scalable from a solo contractor to a 50-person firm.

## The Opportunity

No purpose-built software exists for this vertical. General CRM tools (Pipedrive, HubSpot, Monday.com) miss NDT-specific needs:
- Field service / site visit tracking
- Instrument management and calibration scheduling
- Akkreditáció (accreditation) lifecycle management
- NDT-specific report (jegyzőkönyv) generation
- Smart device integration (smart glasses, tablets on site)

Péter's competitive advantage: he knows what NDT companies actually need because he ran one.

## Core Design Principles

### Person-Centric (not Contact-Centric)
The foundational data model is built around **persons**, not contacts. A person (Kovács Béla) is a permanent entity. Their employment at a company is a time-bounded state. When they change employers, the relationship persists. This is in contrast to all existing CRMs which lose track of people when they change jobs.

See [[concepts/Person_Centric_CRM]].

### Task-Based Everything
Every action in the system is a **task** (feladat). Tasks have: owner, time estimate, actual time, cost, revenue, skill requirement, frequency, status. This makes every process measurable, automatable, and AI-analyzable.

See [[concepts/Microtask_Decomposition]] and [[concepts/Task_Based_Organization]].

### AI-First Automation
Non-revenue-generating tasks should be handled by AI agents wherever possible. The system is designed for AI ↔ human ↔ humanoid robot collaboration — the same task structure works for all three.

See [[concepts/AI_First_Model]].

## Current State

- Concept defined across multiple monologues
- An unnamed 21-year-old developer (see [[entities/Developer_Speaker3]]) is building it
- Starting point: possibly renting an existing CRM (Monday.com, Pipedrive) + automations as a prototype
- Final version: fully custom-built, owned by [[entities/Arpil]], rented to [[entities/Control_Labor]] as first tenant

## Key Features Planned

- Client & contact management (person-centric data model)
- Quote generation (80-90% automated; see [[projects/Automated_Quote_System]])
- Field work tracking (site check-in/check-out, task completion)
- Smart glasses integration — auto-logs completed tasks, links to CAD drawings and photos
- Instrument (gép) management + calibration scheduling
- Subcontractor management and performance verification
- Teljesítési igazolás (completion certificate) generation
- Invoice (számla) generation and delivery (print/email/post)
- Accreditation calendar and compliance tracking
- Analytics / AI pattern detection on quote outcomes, timing, etc.

## Related Domains

- [[domains/NDT]]
- [[domains/Software_SaaS]]

## Overlaps

- The person-centric data model is the same concept needed for the [[projects/NDT_Brokerage]] system
- The task structure is the operational backbone for [[projects/Concrete_Testing]]
- The subcontractor verification system overlaps with [[projects/NDT_Brokerage]] (same providers)
- The marketing/lead intake module overlaps with [[projects/Automated_Quote_System]]

## Commercialization Strategy

1. Build prototype inside [[entities/Control_Labor]] (use it as a live test lab)
2. Sell Control Labor together with the system — the software becomes an asset that elevates sale price
3. Long-term: rent to other NDT companies as SaaS
4. Alternative: "Instant Vállalkozás" — package the operating model + software as a turnkey product

## Open Questions

- What is the priority order of features to build first?
- What tech stack is the developer using?
- Is the first version a custom build or a rented CRM with automations? (Contradiction in raw1 — see [[questions/Q-crm-build-vs-rent]])
