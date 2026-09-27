# StoreOps Harness

A working Claude Code development harness that governs how a retail-operations REST API
(**StoreOps** — activities, programmes, staff, alerts, reports; TypeScript / Express) accepts
AI-generated changes. This repository is the capstone submission for the Cognizant AI-Native
Tech Architect Programme, Case Study 1, Build Track. The application code (`src/`) is the
subject; `.harness/` is the system under assessment.

**Live at:** https://github.com/c-soumen/storeops-harness

## Read in this order

Reviewers should open these six things — nothing else is required to grade the submission.

1. **[DESIGN_BRIEF.md](./DESIGN_BRIEF.md)** — architectural reasoning in four sections
   (intent decomposition, governance framework, non-determinism strategy, key decisions).
   The document deliverable — 17% of the grade.
2. **[CLAUDE.md](./CLAUDE.md)** — the orchestrator. Nine sections covering entry point,
   agents, sequence, routing logic, escalation, context scoping, CI/CD relationship, file map,
   commands.
3. **[.harness/agents/](./.harness/agents/)** — four agent definitions: `planner`,
   `generator`, `evaluator`, `monitor`. Each states its skill reads, its handoff artefact, and
   its stop conditions.
4. **[.harness/skills/](./.harness/skills/)** — eight skill files (spec minimum is six).
   Two are shared foundation (`app-context`, `architecture-principles`); the rest are single-
   reader per agent. Every rule cites StoreOps directly — a skill file that could apply to any
   REST API would fail its own §B traceability test.
5. **[.harness/reviews/](./.harness/reviews/)** — the governance audit trail. Six files
   across two sprints (generator-summary, evaluator-feedback, run-log per sprint), plus more
   after the live-loop resumes.
6. **[PROMPT.md](./PROMPT.md), [DEPLOYMENT.md](./DEPLOYMENT.md), [REFLECTION.md](./REFLECTION.md)** —
   demonstration-run artefacts. The prompt used to invoke the harness, the deployment
   evidence, and a one-page reflection on the run.

Optional bonus reading: **[JOURNAL.md](./JOURNAL.md)** — build-time decisions, rejected paths,
and observations about Claude Code as a platform. Not graded core but weighted +10% bonus.

## Run the four gates

Everything the harness enforces reduces to these four commands. Run them yourself before
reading anything else.

```bash
npm install && npx tsc --noEmit && npx eslint . && npx jest --coverage && npx jest tests/shared/architecture.test.ts
```

Baseline result: 232 tests / 12 suites / 97% statements / 90% branches / ~21s. Any red output
here is a bug in the harness, not in the review.

## Run the app locally

```bash
npm start
curl -H "Authorization: Bearer token-manager" http://localhost:3000/api/activities
```

The demonstration feature (bulk status update) responds at
`PATCH /api/activities/bulk-status` — see `PROMPT.md` for the invocation and the sprint-2
evaluator feedback for the 207 Multi-Status body.
