<a id="readme-top"></a>

<div align="center">

[![TypeScript][TS-shield]][TS-url]
[![Next.js][Next-shield]][Next-url]
[![React][React-shield]][React-url]
[![Supabase][Supabase-shield]][Supabase-url]
[![Prisma][Prisma-shield]][Prisma-url]
[![PostgreSQL][Postgres-shield]][Postgres-url]
[![Tailwind CSS][Tailwind-shield]][Tailwind-url]

</div>

<div align="center">
  <h1>NDT CRM</h1>
  <p>
    A custom CRM/ERP for the non-destructive testing industry — built to replace an off-the-shelf CRM that never fit the workflow.
  </p>
  <p>
    <a href="#about-the-project">About</a>
    ·
    <a href="#core-domain-model">Domain Model</a>
    ·
    <a href="#whats-built">What's Built</a>
    ·
    <a href="#getting-started">Getting Started</a>
    ·
    <a href="#roadmap">Roadmap</a>
  </p>
</div>

<details>
  <summary>Table of Contents</summary>
  <ol>
    <li>
      <a href="#about-the-project">About The Project</a>
      <ul>
        <li><a href="#the-client">The Client</a></li>
        <li><a href="#tech-stack">Tech Stack</a></li>
      </ul>
    </li>
    <li><a href="#core-domain-model">Core Domain Model</a></li>
    <li><a href="#task-system">Task System</a></li>
    <li><a href="#processes-tracked">Processes Tracked</a></li>
    <li><a href="#whats-built">What's Built</a></li>
    <li><a href="#ai-layer-in-progress">AI Layer (in progress)</a></li>
    <li>
      <a href="#getting-started">Getting Started</a>
      <ul>
        <li><a href="#prerequisites">Prerequisites</a></li>
        <li><a href="#installation">Installation</a></li>
      </ul>
    </li>
    <li><a href="#project-structure">Project Structure</a></li>
    <li><a href="#roadmap">Roadmap</a></li>
    <li><a href="#license">License</a></li>
    <li><a href="#contact">Contact</a></li>
  </ol>
</details>

## About The Project

NDT CRM is a customer-relationship and operations system built for the **non-destructive testing (NDT) industry** — firms that inspect bridges, pipelines, welds, and concrete structures for hidden defects.

It replaces a Zoho deployment the client had outgrown. Generic CRMs put a sales pipeline at the centre, but an NDT business is field-service-driven, person-centric, and audit-heavy. Every inspection is a regulated job with timestamps, equipment serial numbers, a split between billable and internal work, and reports that have to hold up years later. That doesn't fit a Pipedrive board.

The system is built around how the work actually happens: people are first-class entities, tasks are atomic, and every state change is timestamped.

> **On the live demo:** the deployed instance runs against a real client's data (a contact database migrated out of Zoho), so there's no public demo link. The sections below document the data model and the features in detail.

### The Client

The first production tenant is **Controllabor**, an established NDT inspection company in Hungary. The system was specified directly against their workflow, with their operations lead acting as domain expert. Their Zoho export — 8,236 rows — was cleaned down to roughly 7,991 usable contacts by a custom Python ETL before migration.

The CRM is deliberately a **separate product** from the operating company. Controllabor is the first tenant, but the schema and feature set are designed so other NDT firms across the EU can be onboarded as additional tenants.

### Tech Stack

- **Framework:** Next.js 16 (App Router), React 19, TypeScript — server components and server actions, one deployable app
- **Database:** PostgreSQL on Supabase, accessed through Prisma 7
- **Auth:** Supabase Auth (email + magic link), enforced app-wide at the request layer
- **UI:** Tailwind CSS 4 with a custom dark, industrial design system
- **Data migration:** a standalone Python/Node ETL that loads the cleaned Zoho export into the schema

The project started as a NestJS + Vite prototype and was rebuilt as the single Next.js app in `web/`, which is what runs today.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Core Domain Model

The central design decision — and the reason an off-the-shelf tool wouldn't do — is that **a Person and a Contact are not the same thing.**

In most CRMs the "contact" is the entity. That breaks down in relationship-heavy B2B work like NDT, where the same engineers move between inspection firms, equipment vendors, and end clients over careers that span decades.

- **Person** — the entity. A human being, who persists no matter who they work for.
- **Contact** — a *state*: the relationship between a person and the business, bound to a time interval and a specific employer.
- **Company** — also an entity.

When an engineer moves from Company A to Company B, they don't vanish from the system. Their communication history and context stay attached to the *person*; only the contact record changes. LinkedIn is the closest analogy — a profile that outlives any one employer.

None of the off-the-shelf tools evaluated during specification (Pipedrive, HubSpot, Zoho, Monday) model this. For an industry where one engineer might be your customer at three different employers across fifteen years, that gap is the whole point.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Task System

Everything in the system is a **task**, and tasks are kept deliberately granular:

- "Write email" and "Send email" are two tasks.
- "Prepare completion certificate" and "Get it signed" are two tasks — often handled by different people.

**Task fields:**

- Due date
- Assigned person(s)
- *Normaidő* (a standard time estimate), measured against actual completion time across cycles so the firm learns its real throughput
- Category: revenue-generating vs. cost-only, and external (billable) vs. internal
- Recurrence: one-off or recurring
- Advance notice: flag a task weeks or months before it's due
- Status: Not Started → In Progress → Finished

Every state change is timestamped, with a full audit history on each record. In a regulated inspection industry, where a report can be challenged years after it was issued, that isn't optional.

The granularity also pays off later: when parts of the workflow are automated, software agents (and eventually field equipment) need unambiguous atomic tasks they can pick up and confirm. The atomic task is the contract between people and machines, so building it now means the AI layer can extend the same schema instead of replacing it.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Processes Tracked

- **Sales** — lead → offer → contract
- **Marketing** — outreach and response tracking
- **Contracts & legal** — versioned documents, signature tracking
- **Field reports** — site-visit minutes and inspection logs
- **Field service & scheduling** — engineer routing and equipment dispatch
- **Equipment management** — inspection reports auto-filled with instrument serial numbers instead of typed by hand
- **Employee / HR** — internal assignment and capacity planning
- **Billing** — separate routing for who receives the invoice and who receives the report, which in NDT are often different people

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## What's Built

The Next.js application currently ships:

- **Companies & people** — list and detail views, search, time-bounded contacts, and a per-person employment timeline that keeps history attached to the person across job changes
- **Tasks** — create / edit / complete, due dates, subtasks, estimated vs. actual time, and a universal quick-create reachable from anywhere
- **Interactions** — append-only logging of calls, emails, meetings, and site visits from any company or person, shown as a timeline
- **Deals** — fully customizable pipelines with user-defined stages and custom fields, a drag-and-drop kanban, weighted forecast, and a stale-deal flag
- **Dashboard** — today's tasks, overdue work, recently quiet accounts, and a pipeline overview
- **Analytics** — KPI tiles and charts over the real dataset, with drill-through into the underlying records
- **Invoices** — browsable historical invoice data per company and year
- **Global search** — Ctrl/Cmd-K across companies, people, deals, tasks, and tags
- **Audit log** — before/after history on entity changes, surfaced on detail pages
- **Tags** — one tag spanning companies, people, deals, tasks, and interactions, filterable everywhere
- **Auth** — Supabase email/magic-link sign-in, enforced for every page, API route, and server action at the request layer

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## AI Layer (in progress)

Because the schema is structured and every task is atomic, an AI layer can sit on top of it rather than being bolted on. The planned and prototyped pieces:

- **Cross-reference analysis** — surface non-obvious correlations in the history (for example, offers answered within seconds winning disproportionately, regardless of price)
- **Clarifying-question generator** — when a record is ambiguous (missing role, conflicting employer), draft the exact question that would resolve it
- **Outreach watcher** — check outgoing messages against tone and context before they're sent
- **Morning briefing** — each person's tasks for the day, in execution order, with the context they need
- **Longer term** — task definitions that a person or an automated system can each pick up and complete

This layer was validated in an earlier prototype (Supabase + Groq) and is being rebuilt against the current schema; it is not yet part of the deployed app.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Getting Started

The live application is the Next.js app in `web/`.

### Prerequisites

- Node.js 20+
- A Supabase project (PostgreSQL database + Auth)

### Installation

1. Clone the repo
   ```sh
   git clone https://github.com/aron166/ndt-crm.git
   cd ndt-crm/web
   ```

2. Install dependencies
   ```sh
   npm install
   ```

3. Configure the environment
   ```sh
   cp .env.example .env.local
   # set DATABASE_URL (Supabase Postgres) plus the Supabase URL and keys
   ```

4. Apply the schema and start the dev server
   ```sh
   npx prisma migrate deploy
   npm run dev
   ```

5. Open `http://localhost:3000` and sign in.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Project Structure

```
ndt-crm/
├── web/          # The application — Next.js App Router, Prisma, Supabase
│   ├── prisma/   # Schema + migrations
│   └── src/      # Routes (app/), server actions, components, lib
├── etl/          # Zoho → PostgreSQL migration pipeline
└── ADR/          # Architecture Decision Records
```

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Roadmap

- [x] Core schema: Person / Contact / Company / Task with full audit history
- [x] Zoho data migration via a custom ETL
- [x] Supabase auth, enforced across pages, API routes, and server actions
- [x] Task system with standard-time tracking, subtasks, and recurrence
- [x] Append-only interaction logging
- [x] Customizable deal pipelines with kanban and weighted forecast
- [x] Analytics dashboard with drill-through
- [x] Global search and cross-entity tagging
- [ ] Field-report module with equipment auto-fill
- [ ] AI layer rebuilt on the current schema (clarifying questions, outreach watcher, briefings)
- [ ] Second NDT firm onboarded as a tenant
- [ ] Mobile field-service view for on-site engineers

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## License

Proprietary. All rights reserved.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Contact

Áron Balogh — [balogharon16@gmail.com](mailto:balogharon16@gmail.com) — [LinkedIn](https://www.linkedin.com/in/aron-balogh166/)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- shields -->
[TS-shield]: https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white
[TS-url]: https://www.typescriptlang.org/
[Next-shield]: https://img.shields.io/badge/Next.js-16-000000?style=for-the-badge&logo=nextdotjs&logoColor=white
[Next-url]: https://nextjs.org/
[React-shield]: https://img.shields.io/badge/React-19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB
[React-url]: https://react.dev/
[Supabase-shield]: https://img.shields.io/badge/Supabase-3FCF8E?style=for-the-badge&logo=supabase&logoColor=white
[Supabase-url]: https://supabase.com/
[Prisma-shield]: https://img.shields.io/badge/Prisma-7-2D3748?style=for-the-badge&logo=prisma&logoColor=white
[Prisma-url]: https://www.prisma.io/
[Postgres-shield]: https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white
[Postgres-url]: https://www.postgresql.org/
[Tailwind-shield]: https://img.shields.io/badge/Tailwind-4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white
[Tailwind-url]: https://tailwindcss.com/
