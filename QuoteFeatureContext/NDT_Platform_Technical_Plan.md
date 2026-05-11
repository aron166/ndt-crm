# NDT Platform — Full Technical Plan
> Version 1.0 | 2026-04-24 | Áron (CTO) + Péter (CEO)

---

## Concept

A quote aggregation marketplace for non-destructive testing (NDT) services. Companies needing NDT work submit a structured project brief. Partner labs receive auto-generated pre-filled quotes based on their own pricing schemas. All quotes are returned within **1 hour, guaranteed**. Platform takes commission on closed deals.

This is only possible because labs pre-load their pricing schemas. The system computes their quote mathematically — no manual work for the lab until they hit approve.

---

## End-to-End Flow — The Complete Process

This is the full journey from a client needing NDT work to a deal being closed. One continuous timeline, all users involved.

---

### Step 1 — Client submits a project (T = 0:00)

The client logs into their portal and fills the intake form:
- What type of NDT service they need (ultrasonic testing, radiographic testing, etc.)
- Where the job is (location)
- Scope: what material, what component, estimated hours of work
- Required certifications the lab must hold
- Preferred deadline
- Any documents (technical drawings, specs)

If anything is ambiguous or missing, the platform asks 2–3 targeted follow-up questions before accepting the submission. Once submitted, the client sees a **"Quotes incoming"** screen with a live countdown timer showing 1 hour remaining. They also get a confirmation email.

---

### Step 2 — Platform computes and distributes quotes (T = 0:01)

Immediately after submission, the backend:

1. Finds all active partner labs that match the request: correct service type, correct certifications, within travel range of the job location
2. For each matching lab, calculates a pre-filled quote using that lab's own pricing schema (rate × hours + travel cost)
3. Stores a pending quote in the database for each lab
4. Fires a Trigger.dev background job that manages the 1-hour window
5. Sends a notification email to every matched lab: **"New NDT request — you have 1 hour to respond"**

The client doesn't see any of this. Their timer is counting down.

---

### Step 3 — Labs respond (T = 0:01 to 1:00)

Each lab receives the email and clicks through to their portal. They see:

- The full project brief (what the client needs, where, scope, certifications required)
- A pre-filled quote already generated from their own prices — they don't have to calculate anything
- Their remaining time on a countdown timer

They have three options:
- **Approve as-is** — one click. Their pre-filled price is accepted. Legally binding.
- **Edit then approve** — adjust the price (offer a discount, add a surcharge for complexity), change timeline, add notes. Hit approve. Legally binding.
- **Decline** — they're not interested or unavailable for this job.

Labs that don't respond before the timer hits zero are automatically marked as expired and excluded from the comparison.

---

### Step 4 — Platform compiles the comparison (T = 1:00)

When the 1-hour window closes, Trigger.dev resumes the background job:

1. Collects all quotes with status `approved` or `edited`
2. If zero labs responded → client gets an email: "No quotes received for this request. We'll retry or contact you directly." Project flagged for admin review.
3. If labs responded → platform formats a clean comparison document: side-by-side table of each lab's price, timeline, certifications, any notes they added
4. Stores the comparison in the database
5. Sends the client an email: **"Your quotes are ready"**
6. Updates the client's dashboard

---

### Step 5 — Client reviews and selects (T = 1:00 onwards)

The client logs in and sees the comparison dashboard:

- Up to 3 labs shown side by side
- Price, timeline, certifications, lab notes — all in a clean readable format
- No raw data dumps — everything is rendered as a proper comparison table

The client picks one lab. That selection is recorded. The deal is now initiated.

---

### Step 6 — Deal closes, commission recorded

When a client selects a quote:

1. The selected quote is marked as the winner
2. A commission record is created in the database (deal value × commission rate)
3. Both the client and the winning lab receive a confirmation email with next steps
4. The admin dashboard updates: deal is live, commission pending
5. Péter follows up directly with both parties if needed (especially early on)

The losing labs see on their dashboard that the job was awarded to another lab. No further action needed from them.

---

### What the finished platform looks like from each user's perspective

**Client experience:**
> "I came to the platform, filled out what I needed, and an hour later I had three quotes in a clean table. I picked the best one and that was it. The whole thing that used to take three days took one hour and I didn't have to chase anyone."

**Lab experience:**
> "I got an email saying there's a job. I logged in, the quote was already filled out from my own prices. I checked it, gave a small discount because the job was close to us, hit approve, and done. Twenty seconds."

**Admin experience:**
> "I can see every active project, which labs have responded, who's lagging, how much commission is in the pipeline this month. Péter manages the relationships, the platform handles the mechanics."

---

## The Three Users

### 1. Client (company needing NDT work)

**Onboarding:** Email/password registration. Company name, contact details, VAT number.

**Submitting a project:**
1. Fill structured intake form: service type (UT, RT, MT, PT, VT, etc.), location, scope of work, material/component details, required certifications, deadline, document attachments
2. If the form has gaps → system asks specific targeted follow-up questions (not a chatbot conversation, just conditional form logic + optional small Claude call)
3. Submit → "Quotes incoming" page with live 1-hour countdown timer
4. Email when quotes are ready

**Receiving quotes:**
- Side-by-side comparison of up to 3 labs: price, timeline, certifications, notes
- Clean formatted comparison table — no raw numbers
- Selects one → confirms → deal initiated → platform notified

**Dashboard:** history of all submitted projects, status, past quotes, deal outcomes.

---

### 2. Lab (NDT laboratory)

**Onboarding (invite-only — Péter brings them in personally):**
1. Admin sends invite email
2. Lab fills pricing schema: for each service (UT, RT, etc.) — rate per hour, minimum hours, travel cost per km, minimum call-out fee, surcharges
3. Sets service radius (max km they'll travel)
4. Uploads certifications (PDFs → Supabase Storage)
5. Goes live as platform partner

**When a matching project comes in:**
1. Email: "New NDT request — 1 hour to respond"
2. Log into lab portal
3. See: project brief + pre-filled quote already generated from their own prices
4. Options:
   - **Approve as-is** — one click, legally binding
   - **Edit** — adjust price (discount/surcharge), add notes, modify timeline → approve
   - **Decline** — opt out of this job
5. Countdown timer visible. When it hits zero → window closed, opportunity gone.

**Dashboard:** incoming requests, submitted quotes, win/loss rate, revenue through platform.

---

### 3. Admin (Áron + Péter)

**Deal oversight:**
- All active projects and real-time status
- Which labs responded, which haven't, time remaining
- Manual override: extend deadline, nudge a lab, flag a deal

**CRM:**
- All labs (platform partners + Péter's pipeline contacts)
- All client companies
- Contact history, notes, last activity
- Flag a CRM contact as "platform partner" → brings them into the quote system
- Import from existing database (Péter's Zoho export, 8,000+ contacts)

**Commission tracking:**
- Per-deal commission log
- Paid / pending / disputed
- Revenue dashboard: monthly, per lab, per client segment

**Lab management:**
- Onboard new labs, edit pricing schemas, deactivate
- Per-lab performance: win rate, response rate, average price

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Frontend + API | **Next.js 15** (App Router) + TypeScript | Fullstack in one repo, server actions, Vercel deploy |
| UI | **Tailwind CSS** + **shadcn/ui** | Fast, consistent, accessible components |
| Database + Auth + Realtime | **Supabase** | PostgreSQL, built-in auth with role claims, row-level security, realtime for live timer |
| Background Jobs | **Trigger.dev** | Purpose-built for event-driven workflows with delays — 1-hour countdown is a native `wait()` call |
| Email | **Resend** + React Email | Templated emails as React components, free tier |
| AI (sprinkle only) | **Claude API** (Anthropic SDK) | Intake clarification follow-ups + optional comparison formatting polish. No AI in the quote engine. |
| Deployment | **Vercel** | Zero-config Next.js, free for this scale |

All managed cloud. No self-hosted infra.

---

## Architecture

### One App, Three Portals

One Next.js codebase. Middleware reads the user's role from Supabase session and routes accordingly. A lab accessing `/client/` gets bounced.

```
app/
├── (auth)/
│   ├── login/
│   └── register/
│
├── (platform)/
│   ├── client/
│   │   ├── dashboard/           ← project history, deal status
│   │   ├── submit/              ← structured intake form
│   │   └── quotes/[projectId]/  ← comparison view, select lab
│   │
│   └── lab/
│       ├── dashboard/           ← incoming requests, win/loss history
│       ├── onboarding/          ← pricing schema builder
│       └── quote/[quoteId]/     ← view brief + approve / edit / decline
│
└── (admin)/
    ├── dashboard/               ← live deal overview
    ├── crm/
    │   ├── contacts/            ← all contacts (labs + clients)
    │   ├── labs/                ← platform partner management
    │   └── clients/             ← client company management
    ├── deals/                   ← full deal history + manual override
    ├── commissions/             ← revenue tracking
    └── settings/                ← commission rates, email templates, config
```

---

## Database Schema

```sql
-- Extends Supabase auth.users
profiles (
  id uuid references auth.users primary key,
  role text check (role in ('client', 'lab', 'admin')),
  company_name text,
  contact_name text,
  phone text,
  created_at timestamptz default now()
)

-- Lab-specific data
labs (
  id uuid references profiles(id) primary key,
  location_lat float,
  location_lng float,
  location_label text,          -- e.g. "Budapest, XIV. kerület"
  max_travel_km int,
  certifications text[],        -- e.g. ["EN ISO 9712", "MSZ EN 473"]
  is_active boolean default true
)

-- Lab's pricing rules — used to auto-compute quotes
lab_pricing_schemas (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid references labs(id),
  service_code text,            -- "UT", "RT", "MT", "PT", "VT"
  rate_per_hour numeric,
  minimum_hours numeric,
  travel_cost_per_km numeric,
  minimum_callout_fee numeric,
  notes text,
  updated_at timestamptz default now()
)

-- Client's NDT project request
projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references profiles(id),
  service_type text,
  location_label text,
  location_lat float,
  location_lng float,
  scope_description text,
  estimated_hours numeric,
  required_certifications text[],
  deadline_preference date,
  documents text[],             -- Supabase Storage URLs
  status text check (status in ('clarifying', 'pending', 'quotes_ready', 'closed', 'failed')),
  created_at timestamptz default now()
)

-- One quote per lab per project
quotes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id),
  lab_id uuid references labs(id),
  computed_price numeric,       -- auto-calculated from pricing schema
  lab_price numeric,            -- final price after lab edits (null = approved as-is)
  lab_notes text,
  status text check (status in ('pending', 'approved', 'edited', 'declined', 'expired')),
  expires_at timestamptz,       -- created_at + 1 hour
  responded_at timestamptz,
  is_legally_binding boolean default false
)

-- Formatted comparison delivered to client
comparisons (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id),
  selected_quote_id uuid references quotes(id),
  formatted_data jsonb,
  sent_at timestamptz,
  client_selected_at timestamptz
)

-- Commission ledger
commissions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id),
  quote_id uuid references quotes(id),
  deal_value numeric,
  commission_rate numeric,
  commission_amount numeric,
  status text check (status in ('pending', 'invoiced', 'paid')),
  created_at timestamptz default now()
)

-- CRM contacts (Péter's network + platform signups)
crm_contacts (
  id uuid primary key default gen_random_uuid(),
  type text check (type in ('lab', 'client', 'prospect', 'other')),
  company_name text,
  contact_name text,
  email text,
  phone text,
  notes text,
  platform_account_id uuid references profiles(id),  -- null if not yet on platform
  source text,                  -- "zoho_import", "manual", "platform_signup"
  created_at timestamptz default now()
)
```

**Row-level security (Supabase RLS)** enforces access at the DB level: labs only see their own quotes, clients only see their own projects, admins see everything.

---

## Quote Engine (pure computation — no AI)

When a project is submitted, for each matching lab:

```
matching criteria:
  - lab.is_active = true
  - service_code matches project.service_type
  - required_certifications ⊆ lab.certifications
  - distance(project_location, lab_location) ≤ lab.max_travel_km

computation:
  travel_km       = distance(project.location, lab.location)
  base_price      = max(minimum_callout_fee, rate_per_hour × estimated_hours)
  travel_cost     = travel_km × travel_cost_per_km
  computed_price  = base_price + travel_cost
```

Result: a `quote` row per lab with `status: pending`, `computed_price` filled, `expires_at: now() + 1 hour`.

Deterministic, auditable, no LLM cost. AI is only called if the client's intake form is ambiguous (rare edge case).

---

## Trigger.dev Workflow

The 1-hour deadline is not a cron job. It's an event-driven background job with a native delay. Trigger.dev runs this in their cloud — no server needed.

```typescript
export const processQuoteRequest = client.defineJob({
  id: "process-quote-request",
  name: "Process NDT Quote Request",
  version: "1.0.0",
  trigger: eventTrigger({ name: "quote.requested" }),

  run: async (payload: { projectId: string }, io) => {
    const { projectId } = payload

    // 1. Compute and store pre-filled quotes for all matching labs
    const quotes = await io.runTask("compute-quotes", async () => {
      return await computeQuotesForProject(projectId)
      // inserts quote rows into DB, status: pending
    })

    // 2. Notify all matched labs in parallel
    await io.runTask("notify-labs", async () => {
      await Promise.all(
        quotes.map(quote => sendLabNotificationEmail(quote))
      )
    })

    // 3. Wait exactly 1 hour — Trigger.dev handles this, not your server
    await io.wait("quote-deadline", 60 * 60)

    // 4. Collect all quotes that came back approved or edited
    const responses = await io.runTask("collect-responses", async () => {
      return await getRespondedQuotes(projectId)
      // fetches quotes where status IN ('approved', 'edited')
    })

    // 5. No responses — notify client and close
    if (responses.length === 0) {
      await io.runTask("notify-failure", async () => {
        await notifyClientNoQuotes(projectId)
        await updateProjectStatus(projectId, "failed")
      })
      return
    }

    // 6. Format comparison and send to client
    await io.runTask("send-comparison", async () => {
      const comparison = formatComparison(responses) // deterministic template
      await saveComparison(projectId, comparison)
      await sendClientComparisonEmail(projectId, comparison)
      await updateProjectStatus(projectId, "quotes_ready")
    })
  }
})
```

Every step is logged, retryable, and visible in Trigger.dev's dashboard.

---

## CRM Integration

The CRM is not a separate application. It lives in `/admin/crm/` in the same Next.js project and reads from the same Supabase database.

**Connection points:**
- Péter's existing Zoho contacts are imported into `crm_contacts` on day one
- When a lab registers on the platform, their `profiles.id` is written back into `crm_contacts.platform_account_id`
- Admin can view any CRM contact and see their platform activity (quotes, win rate, schema)
- Admin can initiate lab onboarding directly from a CRM contact: send invite → they register → record auto-links

**Future extraction:** If the CRM grows large enough to justify its own product, it moves to a separate Next.js app pointing at the same Supabase project. Zero data migration. Just change which app makes the DB calls.

---

## Build Phases

### Phase 1 — Foundation (Week 1–2)
- `npx create-next-app@latest ndt-platform --typescript`
- Supabase project: full schema above, auth configured, RLS policies written for all 3 roles
- Next.js route structure scaffolded (all folders, placeholder pages)
- Middleware: reads session role → redirects to correct portal
- Tailwind + shadcn/ui installed
- Import Péter's Zoho export into `crm_contacts`

### Phase 2 — Lab Side (Week 3)
- Lab onboarding flow: registration → pricing schema builder form
- Lab dashboard skeleton
- Admin: lab list, edit schema, activate/deactivate
- Manually onboard 2–3 pilot labs with Péter

### Phase 3 — Client Intake (Week 4)
- Project submission form (all structured fields)
- Clarification follow-up (conditional questions, optional Claude call for ambiguous briefs)
- Project status page with live countdown (Supabase Realtime)
- Client dashboard: project history and status

### Phase 4 — Core Engine + Trigger.dev (Week 5–6)
- Quote computation logic (the math above)
- Trigger.dev job: wired up end to end
- Lab portal: view request + pre-filled quote + approve / edit / decline UI
- Resend email templates: lab notification + client comparison
- Mark approved quotes as legally binding in DB

### Phase 5 — Comparison + Closing (Week 7)
- Client comparison dashboard: side-by-side quote view
- Client selects a quote → deal initiated
- Commission record auto-created
- Admin deal overview: real-time status of all active projects

### Phase 6 — CRM + Admin + Deploy (Week 8)
- CRM views: contacts, link platform accounts, notes
- Commission tracking dashboard
- Admin manual override tools
- Deploy to Vercel
- Run first real deal end-to-end with Péter

---

## Key Decisions

| Decision | Choice | Reason |
|---|---|---|
| App structure | One codebase, one DB | CRM is `/admin/crm/` — extract later if needed |
| Microservices | No | Premature for solo dev MVP |
| Quote engine | Pure computation | Deterministic, auditable, zero LLM cost |
| AI usage | Intake clarification only | Sprinkle — not the core |
| Background jobs | Trigger.dev | 1-hour delay is native, not a cron hack |
| Lab acquisition | Invite-only via Péter | His network = zero cold onboarding friction |
| Code quality | Ship first | Clean up with money and a proper dev/security audit later |
