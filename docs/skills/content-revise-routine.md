# content-revise — scheduled cloud routine

Kai / Áron set this up (Claude Code routines). Nate does not schedule it.

- **Schedule:** weekdays every 3 hours, 07:00–19:00 Europe/Budapest
  (cron `0 7-19/3 * * 1-5` in the routine's timezone setting = Europe/Budapest).
- **Repository:** `aron166/ndt-crm` (branch `dev`) — the skill lives at
  `.claude/skills/content-revise/SKILL.md`.
- **Secrets / environment:** `CRM_URL=https://ndt-crm.vercel.app`, `CRM_APP_KEY=<app key minted
  in CRM → Beállítások → API kulcsok, slug "content-revise">`.
- **Needs access to:** nothing outside this repo. The claim list is
  `docs/cold-email-framework.md` (merged 2026-09-17).
- **Billing:** Claude subscription only. The routine must not use an Anthropic API key.

## Routine prompt (paste verbatim)

```
Run the content-revise skill (.claude/skills/content-revise/SKILL.md) against the Helm CRM.

Environment: CRM_URL and CRM_APP_KEY are set. Never print CRM_APP_KEY.

Follow the skill exactly:
- pull GET /api/content/queue?status=changes_requested,rewrite_requested;
- for each item: claim, read every reviewer comment and the version history, rewrite
  (rewrite_requested = from scratch per the comments; changes_requested = minimal edit of
  exactly what was asked), post a new version with a Hungarian change note that answers
  every comment point by number;
- for any Hungarian text, invoke the translating-english-to-hungarian skill first; business
  register is magázás; only claims from the closed list in the cold-email FRAMEWORK §6 —
  never add a claim, number, price, reference or depth; if a reviewer asks for one, leave it
  out and say so in the change note;
- images/videos: post the updated brief with needs_human_asset=true;
- on 409 (claimed elsewhere, or a human edited after your claim) skip the item and never retry;
- never call any endpoint other than queue, claim and versions.

Finish with the skill's summary block (revised / skipped with reasons / questions for the
reviewers). If the queue is empty, reply "Nothing to revise." and stop. If the CRM returns 5xx
twice in a row, stop and report it.
```
