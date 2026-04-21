# ADR 001 — Tech Stack

**Date:** 2026-04-22
**Status:** Accepted

## Decision

TypeScript everywhere. NestJS backend, React + Vite frontend, Prisma ORM, PostgreSQL.

## Context

Building a CRM/ERP for the NDT industry. Solo developer (Áron). Needs to:
- Move fast now (MVP)
- Scale to multi-tenant SaaS later
- Support mobile (field workers) eventually
- Integrate AI (Groq) for query and automation

Options considered:
- Python (FastAPI) + React — two languages, Python ETL already existed
- Java (Spring Boot) + React — too slow solo, heavy for MVP
- TypeScript full-stack — one language, modern, industry standard for CRM startups

## Research

Checked stacks of: Salesforce (Java/Apex), HubSpot (Python+Java), Pipedrive (Node.js+TS),
Monday.com (Node.js+TS), Linear (Node.js+TS), Notion (Node.js).

Pattern: every modern CRM startup (post-2015) uses Node.js/TypeScript.
Java dominates legacy enterprise (SAP, Salesforce) — not the model to follow.

## Rationale

- **One language** = no context switching, shared types between frontend/backend/mobile
- **NestJS over Express/Hono** = this system has real business logic; NestJS modules + DI
  pay off at scale. Linear uses a structured Node backend for the same reason.
- **React SPA over Next.js** = CRM is a fully authenticated app, no SEO, SSR adds complexity
  with zero benefit. Client-side rendering is the right model for rich interactive UIs.
- **Prisma over raw SQL** = type-safe queries, schema-as-code, migration tooling built in
- **Python ETL rewritten in TypeScript** = removes the only Python dependency

## Consequences

- Must rewrite existing Python ETL in TypeScript (estimated: 1-2 days)
- NestJS has a learning curve vs plain Express — offset by excellent documentation
- Cannot use Python-specific AI/ML libraries — acceptable since we only need Groq API calls
