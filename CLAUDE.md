# Helm CRM — NDT CRM for Uphill Trade Ltd.

Next.js App Router + Supabase + Prisma. Purpose-built CRM for NDT inspection companies. First tenant: Controllabor Kft. Owned by Uphill Trade Kft. — the software is an asset, not just tooling.

---

## Start here, every session

1. **Read `memory/INDEX.md`** — maps every topic to a file. Pull only what the task needs.
2. **Don't load everything upfront.** Schema.md for migrations. Stack.md for env/wiring. Current-sprint.md to know what's next. Nothing else unless the task demands it.
3. At session end: update `memory/current-sprint.md` if sprint state changed + append one line to `STATUS.md`.

---

## Non-negotiable data model rules

These never change. Don't re-debate them.

1. **Person ≠ Contact.** Person is the permanent entity. Contact = person at company, time-bounded state. Never collapse these.
2. **Interactions are append-only.** Never update, never delete.
3. **Everything is a task.** Atomic. "Write email" and "send email" = two tasks.
4. **Timestamps on everything.** Every state change is recorded.
5. **Multi-tenant on every query.** Scoped to `tenant_id`. Supabase RLS enforces it at DB level.

Full rationale + what NOT to do: `memory/decisions.md`.

---

## Git workflow

Follow `C:\Users\Áron\workspace\VERSION_CONTROL.md` — non-negotiable across all repos.

- `main` stable · `dev` integration · work on `feature/` / `fix/` / `chore/` branches
- Conventional commits (`feat(scope): ...`). Commit at every logical step.
- Every session ends: pushed branch + open PR to `dev` (`gh pr create --base dev`) + STATUS.md log entry
- Self-merge to `dev` after CI green. `dev` → `main` requires Áron review.
- Never commit `.env`. Never push directly to `main` or `dev`.
