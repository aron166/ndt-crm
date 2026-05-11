
# NDT CRM

Purpose-built CRM/ERP for the non-destructive testing (NDT) industry. Replacing Péter's Zoho CRM with a system that fits the actual workflow: person-centric, task-first, timestamp-driven, field-service-oriented. The most technically grounded project in the Péter partnership — real data, real problem, clear domain knowledge.

## Ownership Model

The CRM is owned by a separate entity (working name "Árpil"), not Controllabor. Controllabor is the first paying tenant. When Controllabor is eventually sold, the buyer acquires a fully-integrated system — increasing sale value. Other NDT firms can rent the same system. This separates product from operating company.

## Data Foundation

- Source: Zoho CRM export — 8,236 rows cleaned to ~7,991 usable contacts via Python script
- Controllabor WordPress site (existing Zoho form embeds were broken; now fixed)
- [[Ops Hub]] was the v0 prototype: React/Vite/Supabase, Groq llama-3.3-70b, deployed to Vercel

## Core Philosophy: Person-Centric, Not Contact-Centric

**The central insight driving the data model:** In existing CRMs, "contact" is the entity. This is wrong for relationship-heavy B2B industries.

- **Person** = the entity (a human; persists regardless of where they work)
- **Contact** = a state (the relationship between a Person and the business, bound to a time interval and employer)
- **Company** = also an entity

When Kovács Béla moves from Company A to Company B, he doesn't disappear — his communication history, relationship quality, and context stay attached to him. The contact record changes; the person record continues.

This model is currently missing from the CRM market for NDT. Péter explicitly said no one has built it, and multiple people have confirmed the gap.

LinkedIn is the closest analogy: a person has a profile that persists across employers.

## Task System

Everything in the CRM is a task. Tasks are extremely granular:
- "Write email" and "Send email" = two separate tasks
- "Prepare completion certificate" and "Get it signed" = two separate tasks (different people may handle each)

**Task fields:**
- Due date
- Assigned person(s)
- Normaidő (standard time estimate) → measured against actual over time
- Category: revenue-generating vs. cost-only; external (billable) vs. internal
- Recurrence: one-off or recurring
- Timing notification: flag X months/weeks before due
- Status: Not Started → In Progress → Finished

**Everything gets a timestamp.** Full audit trail on all state changes. This is non-negotiable.

**Why granularity matters:** When the system is automated, AI agents and eventually humanoid robots need unambiguous atomic tasks they can execute and confirm. Granularity is the interface contract between humans, agents, and robots.

## Processes Tracked

- Sales (lead → offer → contract)
- Marketing
- Contracts and legal
- Minutes/record-keeping (field visit reports, site logs)
- Field service and scheduling
- Equipment management (auto-populate reports with instrument serial numbers — no manual entry)
- Employee/HR
- Billing: who receives invoices, who receives site reports

## AI Layer

- Cross-reference analysis: find hidden correlations (e.g., offers responded to within 22 seconds won disproportionately, regardless of price)
- Clarifying question generator for ambiguous records
- Language/context watcher for outreach communications
- Jarvis-style morning briefing for staff: here are your tasks for today, in order
- Long-term: human + humanoid robot cooperation infrastructure — tasks designed to be executable by either

## CRM Reference Models

- **Pipedrive** — data model inspiration; AI integrations noted
- **HubSpot** — reference for free-tier features
- **Monday.com** — task UI inspiration
- Build own codebase (Áron's preference) rather than renting — more value, more control, sellable

## Status & Priority

- Second priority (after [[BirdsView]] landing page generates initial revenue)
- Strategy: BirdsView first for cash, NDT CRM second for compounding value
- Risk: scope creep. Lock v1 to core person/company/task model only


## Additional notes IMPORTANT
The whole system is this: A person is above everything we will want to nurture personal relationships with people in the business so it needs to be very Linkedin like so a person is still very important after he left a company cuz presuably he works in the same intustry, mesuring also very important but i think it was already mentioned.