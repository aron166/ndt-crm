# call-outcome — scheduled cloud routine

Kai / Áron set this up (Claude Code routines). Nate does not schedule it.

- **Schedule:** propose every 15 minutes on weekdays, 08:00–19:00 Europe/Budapest
  (cron `*/15 8-19 * * 1-5` in the routine's timezone setting = Europe/Budapest).
  This is tighter than content-revise because the setter is calling live — a
  stale queue means a human waits on a task that should already exist.
- **Repository:** `aron166/ndt-crm` (branch `dev`) — the skill lives at
  `.claude/skills/call-outcome/SKILL.md`.
- **Secrets / environment:** `CRM_URL=https://ndt-crm.vercel.app`,
  `CRM_APP_KEY=<app key minted in CRM → Beállítások → API kulcsok, slug
  "call-outcome">`.
- **Needs access to:** nothing outside this repo.
- **Billing: Claude subscription only. The routine must not use an Anthropic
  API key.**

## Routine prompt (paste verbatim)

```
Run the call-outcome skill (.claude/skills/call-outcome/SKILL.md) against the Helm CRM.

Environment: CRM_URL and CRM_APP_KEY are set. Never print CRM_APP_KEY.

Follow the skill exactly:
- pull GET /api/calls/pending?limit=20;
- for each row: read the transcript, pick exactly one of the six outcome slugs
  (no_answer, wrong_number, not_interested, disqualified, callback_requested,
  meeting_booked), write the note in Hungarian magázás from only what was said,
  score confidence as your own honest reading of the transcript (not of how the
  call went) — score low on short/noisy/unclear transcripts, since under-scoring
  costs a human 10 seconds and over-scoring risks a wrong lead state;
- include qualification answers only for slugs the transcript really answered,
  using the known slug set in the skill (omit anything uncertain — a wrong
  answer moves the lead's tier);
- for callback_requested, resolve callback_at to a full ISO datetime in
  Europe/Budapest and never in the past; if only a vague day was said, omit it
  and lower confidence instead of guessing;
- never book, send, or close anything yourself — the CRM decides whether to
  auto-apply; meeting_booked, not_interested and disqualified are never
  auto-applied at any confidence, by design;
- POST /api/calls/result with the parsed object; call_id makes a repeat POST
  idempotent; a deduped:true response means skip it;
- never call any endpoint other than pending and result;
- on 5xx twice in a row, stop the run and report it.

Finish with the skill's summary block (parsed / applied / left for a human with
reason / skipped). If the queue is empty, reply "Nothing to parse." and stop.
```
