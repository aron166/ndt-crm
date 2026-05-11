---
title: Automated Quote & Sales System
type: project
status: active
confidence: high
last_updated: 2026-04-22
sources: [raw1.md, raw6.md, raw8.md, raw9.md, raw10.md]
---

# Automated Quote & Sales System

## What It Is

An end-to-end AI-driven pipeline that takes an inbound inquiry (email or phone) and delivers a validated, client-ready quote within 30 minutes — with minimal human intervention. Deployed first at [[entities/Control_Labor]] for the [[projects/Concrete_Testing]] service.

This is the most fully articulated operational project across the monologues.

## The Pipeline (Step by Step)

```
Inbound email / inquiry
        ↓
[AUTO] Immediate standard reply + meeting request sent
        ↓
[AI] Outbound phone call within minutes to qualify lead
        ↓ (call data captured)
[AUTO] 90% of quote generated automatically from call data + Excel pricing model
        ↓
[HUMAN] Péter validates quote (~2 min review)
        ↓
[AUTO] Final quote sent to client
```

**Total time from inquiry to quote delivery: ~30 minutes**

## Key Components

### 1. Email Auto-Response
- Every inbound email to any of Péter's addresses (info@controllapor.hu, nagypeterzoltan email) gets an immediate standard reply
- Reply is styled in Péter's personal communication style (AI trained on his emails)
- Reply always ends with: relevant answer + request for a meeting/call

### 2. AI Phone Call (Lead Qualification)(optional at first email is suficent for first launch)
- Immediately after email auto-response, an outbound AI call is placed to the prospect
- AI gathers: project type, location, timeline, scope, technical parameters
- All calls are recorded and transcribed
- After call, AI produces a project brief

### 3. Automatic Quote Generation
- 90% of the quote is generated from: (a) call data and clarifying questions about the project, (b) Excel-based pricing model
- Péter receives a notification with the draft quote to validate
- He reviews, adjusts if needed (~2 min), approves
- Quote is sent automatically

### 4. Special Case: X-ray (Röntgen) Quotes IMPORTANT
- Péter currently cannot self-perform X-ray work (no staff, no active accreditation)
- For these: auto-flag, increase price to cover subcontracting margin
- Subcontract to partner firms (verbal agreement with [[entities/Gamma]] exists)

### 5. Subcontractor Management (Backend) IMPORTANT
- Incoming orders converted to standardized internal format by AI
- Task list generated for subcontractors (or internal staff)
- Smart glasses integration on-site: tasks auto-completed as work is done, linked to CAD drawings
- Control verification: Péter's system vs subcontractor's own logs — AI compares both
- Automatic teljesítési igazolás (completion certificate) generation per day/task
- Automatic invoice generation

## Why Speed Is the Strategic Moat

Péter cites Balogh Dávid's book: **40% of NDT contracts are won purely by speed of quoting**. Price, terms, and qualifications matter less than being first with a credible number.

See [[concepts/Speed_As_Competitive_Advantage]].

## Current State

- Detailed concept across multiple monologues (most developed of all projects)
- Not yet built — requires CRM/automation backend
- Verbal subcontractor agreement with Gamma exists
- Pricing model ("árajánlat Excel") exists already
- Missing: the CRM/pipeline software to orchestrate it

## Related Domains

- [[domains/NDT]]
- [[domains/Software_SaaS]]

## Overlaps

- Directly feeds the [[projects/NDT_Brokerage]] model (same speed advantage, same provider network)
- Built on top of the [[projects/NDT_CRM_ERP]] infrastructure
- The AI call / lead qualification system is the same module as the outbound marketing system in raw6

## Open Questions

- Which AI voice provider will handle the outbound calls? (mentioned: "Alexa asszisztens" style)
- Is the Excel pricing model already comprehensive enough to auto-generate 90% of quotes?
- What is the current status of subcontracting agreements beyond Gamma?
