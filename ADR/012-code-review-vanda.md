# ADR 012 — Vanda replaces CodeRabbit and Codex as the PR review gate

**Date:** 2026-09-07
**Status:** Accepted
**Author:** Nate (lead dev, ndt-crm) — recording Kai's call

## Context

CodeRabbit stopped being a usable review gate for this repo:
- It **refused PR #71 outright at 220 files** — its hard limit is 100.
- Its auto-review **never worked on this repo at all**. `.coderabbit.yaml` (added in
  #65) is a no-op under its "<10 stars" eligibility rule, so every PR needed a manual
  `@coderabbitai review` trigger.
- Free capacity is roughly **2 reviews/hour**, which does not survive a session that
  opens several PRs — it stalled #74–#78 with repeated "review rate limited" waits.

The fallback, `codex review --base main` (codex-cli), worked but has its own costs:
it has to run from a **clean throwaway clone**, never the shared worktree (a foreign
session's uncommitted migration made that non-negotiable this session), and it has a
hard usage cap — one run died mid-session ("you've hit your usage limit … try again at
Oct 4th"), forcing #81 to ship unreviewed. On the range it did cover (104 commits, 229
files, #60→#80) it surfaced only **2 findings**, both real but thin for that much
surface area.

## Decision

The review gate for every PR in the portfolio is the **`vanda` subagent**
(`subagent_type: "vanda"`), not CodeRabbit or Codex.

- The **lead dev** invokes her on a branch diff before merging.
- **Kai** invokes her for batch or release reviews (promotions, multi-PR sweeps).
- She is **read-only**: she never edits code and never pushes. She returns a ranked
  findings list.
- The lead dev **triages every finding in the PR body** — fixed or skipped-with-reason,
  no finding left unaddressed silently.

This replaces both CodeRabbit (`.coderabbit.yaml` retired, see repo root) and the
`codex review` fallback as the standing gate.

## Consequences

- **This ADR was referenced before it existed.** Session notes (`memory/
  current-sprint.md`, `STATUS.md`, 2026-09-07) already cited "ADR/012" as the reason
  CodeRabbit was retired, days before this file was written. The reference predates
  the record — a gap worth naming so nobody assumes citation implies the file existed
  at the time.
- **A review is only as good as the brief it's given.** This session Vanda had to
  re-derive a findings list that had already been produced once, because the prior
  session died before its memory ritual ran and the findings were never persisted.
  The gate depends on the surrounding session discipline (memory writes, PR-body
  triage) as much as on Vanda herself.
- **The concrete argument for mandatory, not advisory:** on 2026-09-08 Vanda caught
  **three regressions that the lead dev's own fix had introduced** (see `memory/
  lessons.md`, 2026-09-08 entries on the keyword-matcher length heuristic and the
  table-driven test gap). Those would have shipped on green tests otherwise. A gate
  that only runs when someone remembers to ask for it does not catch that class of
  bug — it has to be in the merge path, not optional.
