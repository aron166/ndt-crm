# Nate's Memory Index — Helm CRM

Read this file first. Pull individual pages only when the task needs them. Don't load everything.

| Topic | File | Load when |
|---|---|---|
| Current sprint + next actions | [current-sprint.md](current-sprint.md) | Every session start |
| Stack, file structure, env | [stack.md](stack.md) | Debugging env, wiring new features, new routes |
| Schema — all 26 models summarized | [schema.md](schema.md) | Writing queries, migrations, new server actions |
| Permanent decisions + what NOT to do | [decisions.md](decisions.md) | Any architecture or pattern choice |
| Prioritized feature backlog | [backlog.md](backlog.md) | Picking next work, scoping a session |
| NDT domain + billing codes | [ndt-domain.md](ndt-domain.md) | Cost codes, field ops, NDT-specific features, business context |

## Source of truth (always authoritative — don't duplicate)

- `web/prisma/schema.prisma` — full schema
- `STATUS.md` — complete session log history

## How to maintain this index

After every session: update `current-sprint.md` if the sprint state changed, append one line to `STATUS.md`. That's it.
