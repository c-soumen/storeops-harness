# StoreOps Development Harness — Orchestrator

This file is the harness. Claude Code reads it on launch; it defines the agents, the sequence they
run in, how verdicts are routed, and when to stop and ask a human.

**What this repository is.** `src/` is the StoreOps API — a retail store operations REST service
(activities, programmes, staff, alerts, reports). `.harness/` is the governance layer that controls
how that code changes. The application code is the subject; the harness is the system under
assessment.

**Why it exists.** The client's engineering standards team observed four failure modes in prior
AI-assisted work: cross-module repository imports, raw `Error` throws bypassing the typed
hierarchy, tests asserting status codes without verifying business rules, and state changes written
directly to sibling modules instead of raised as events. Every gate below traces to one of them.
See `.harness/skills/architecture-principles/SKILL.md`.

---

## 1. Entry point

The developer starts a run with one prompt:

```
@planner <feature description>
```

Example: `@planner Add shift handover bulk update — PATCH /api/activities/bulk-status allowing
outgoing shift staff to mark multiple operational activities as DONE or BLOCKED in a single
request, with partial failure handling and an audit entry per updated task.`

The developer has exactly **two** active steps in a run:

1. Invoke `@planner` with the feature prompt.
2. Review `.harness/output/spec.md` and type `APPROVED`.

Everything after that runs autonomously until all sprints PASS or an escalation is written.

## 2. Agents

| Agent | Definition | Invoked | Reads | Writes |
|---|---|---|---|---|
| Planner | `.harness/agents/planner.agent.md` | Once per feature, by the developer | app-context, architecture-principles, sprint-decomposition | `spec.md`, `sprint-N-contract.md` |
| Generator | `.harness/agents/generator.agent.md` | Once per sprint per iteration | app-context, architecture-principles, coding-conventions, api-integration, how-to-test | `src/`, `tests/`, `generator-summary.md` |
| Evaluator | `.harness/agents/evaluator.agent.md` | After each Generator run | architecture-principles, how-to-review, grading-criteria | `evaluator-feedback.md`, `sprint-N-checks.json` |
| Monitor | `.harness/agents/monitor.agent.md` | After each sprint verdict | app-context, grading-criteria + the sprint's feedback and summary | `run-log.md` → `.harness/reviews/` |

Skill files, and who reads them:

| Skill | Planner | Generator | Evaluator | Monitor |
|---|---|---|---|---|
| `app-context` | ✅ | ✅ | as needed | ✅ |
| `architecture-principles` | ✅ | ✅ | ✅ | |
| `sprint-decomposition` | ✅ | | | |
| `coding-conventions` | | ✅ | via check A13 | |
| `api-integration` | | ✅ (route work) | via check A13 | |
| `how-to-test` | | ✅ | | |
| `how-to-review` | | | ✅ | |
| `grading-criteria` | | | ✅ | ✅ |

Each agent reads its skill files **before** acting — that is feedforward context, not
documentation. An agent that skips them will produce output the next agent rejects.

## 3. Sequence

```
developer: @planner <feature>
    │
    ├─ Planner reads skills, writes spec.md + sprint-N-contract.md (1..T)
    │  spec.md ends: STATUS: AWAITING APPROVAL
    ▼
[HALT] developer reviews spec.md and types APPROVED
    │
    ▼
for sprint N in 1..T:
    iteration i = 1
    ├─ Generator implements sprint-N-contract.md, runs the four gates,
    │  writes generator-summary.md ending GENERATOR: COMPLETE
    ├─ Evaluator re-runs gates, applies 7 hard gates in fixed order, scores
    │  DIM-A (55%) + DIM-B (45%), records sprint-N-checks.json, runs
    │  `node .harness/bin/verdict.mjs` and pastes its VERDICT BLOCK into
    │  evaluator-feedback.md ending VERDICT: PASS | CONDITIONAL PASS | FAIL | ESCALATE
    ├─ Monitor writes run-log.md to .harness/reviews/
    └─ route on verdict (§4)
```

Nothing downstream runs while `spec.md` reads `STATUS: AWAITING APPROVAL`. The literal string
`APPROVED` from the developer is the only thing that releases the loop.

## 4. Routing logic

Read the last `VERDICT:` line of `.harness/output/evaluator-feedback.md`:

| Verdict | Condition | Action |
|---|---|---|
| `PASS` | All hard gates pass; weighted score ≥ threshold | Archive artefacts to `.harness/reviews/`. Advance to sprint N+1. If N was the last sprint, the feature is done — report to developer |
| `CONDITIONAL PASS` | All hard gates pass; score below threshold but no correctness finding | Archive. Advance, **and** carry the findings forward into the next sprint's Generator invocation as required rework |
| `FAIL` | Any hard gate failed, or a correctness finding | If iteration < 3: re-invoke Generator with `evaluator-feedback.md`, iteration+1, same contract. If iteration = 3: escalate (§5) |

The verdict is **computed, not judged**: the Evaluator records binary check results and
`.harness/bin/verdict.mjs` applies the rule table from `grading-criteria` §5. Identical check
results therefore produce byte-identical output — verified by running it three times on the same
input and diffing (empty). See `grading-criteria` §5 for the table and the thresholds.

Also escalate immediately, without consuming iterations, on:

- `GENERATOR: BLOCKED` or `STATUS: BLOCKED` — the agent cannot proceed
- A missing or unparseable `VERDICT:` line — the Evaluator's own output is ambiguous
- Two consecutive identical `FAIL` findings — the loop is not converging

**Never** advance a sprint on a `FAIL`. **Never** let the Generator grade itself. **Never** edit a
gate to turn a FAIL into a PASS; that is the one action that invalidates the whole harness.

## 5. Escalation

Maximum **3 iterations per sprint**. On the fourth attempt, stop and write
`.harness/output/escalation.md`:

```markdown
# Escalation — Sprint <N>

**Feature:** <from spec.md>
**Sprint:** <N> of <T> — <title>
**Iterations used:** 3 of 3
**Last verdict:** FAIL

## Blocking issue
<one paragraph: what is failing and why three attempts did not fix it>

## Evidence
| Iteration | Verdict | Primary finding |
|---|---|---|

## Gate status at escalation
| Gate | Result |
|---|---|

## What the developer must decide
<the specific question: is the contract wrong, is the gate wrong, or is the
feature under-specified? Name the file and line where the decision lands.>

---
ESCALATION: OPEN
SPRINT: <N> of <T>
```

The escalation is surfaced to the developer and the run halts. An escalation is a **successful**
harness outcome — it is the system refusing to ship something it cannot verify. Silently passing
unverifiable work is the failure.

## 6. Context scoping

Long runs degrade when context accumulates. This harness bounds it structurally:

- **Files, not conversation.** Every handoff is a file in `.harness/output/`. An agent is invoked
  fresh, reads what it needs, writes its artefact, and ends. No agent depends on another's
  context window.
- **One invocation per unit of work** — one Planner per feature, one Generator per sprint per
  iteration, one Evaluator per Generator run, one Monitor per sprint verdict.
- **Reset between sprints.** Sprint N+1's Generator does not inherit sprint N's context; it reads
  the new contract and the current state of `src/`. This is why contracts pin type names and
  shapes: the seam has to survive a context reset.
- **Scoped reads.** Agents read their skill files in full and only the source files their contract
  names. Nobody reads all of `src/`.
- **Budgeted artefacts.** `spec.md` ≤ ~2 pages, each contract ≤ ~1.5, `generator-summary.md` and
  `evaluator-feedback.md` ≤ ~1.5. These are re-read on every iteration, so length is a recurring
  cost, not a one-off. Skill file depth is the deliberate trade: ~1,000–1,500 words each, spent
  once per invocation, to avoid an agent reading the codebase to infer its own rules.

## 7. Relationship to CI/CD

The harness **precedes and feeds** CI. It does not replace it.

| | Harness (`.harness/`) | CI pipeline (`.github/`) |
|---|---|---|
| When | Before the commit, per sprint iteration | After push, per commit/PR |
| Gates | `tsc --noEmit`, `eslint .`, `jest --coverage`, `architecture.test.ts` | The same four, plus build, container image, deploy |
| Authority | Blocks the Generator from advancing | Blocks the merge |
| On failure | Feedback to Generator, up to 3 iterations, then human | Red build, human |

The four automated gates are deliberately **identical** to the pipeline's quality gates, so the
harness cannot pass something CI will reject. CI remains the enforcement boundary for anything the
harness cannot see: secrets, deploy config, integration against real infrastructure.

`.harness/` is kept separate from `.github/` on purpose — governance-of-generation is a different
concern from build-and-deploy, and mixing them would make the harness look like a CI detail rather
than an architectural layer.

## 8. File map

| Path | Role | Git |
|---|---|---|
| `CLAUDE.md` | This file — orchestrator | Committed |
| `PROMPT.md` | Feature prompt for the demonstration run | Committed |
| `README.md` | Reviewer navigation — reading order, gate command, local run | Committed |
| `DESIGN_BRIEF.md` | Architectural reasoning — §A intent, §B governance, §C non-determinism, §D decisions | Committed |
| `DEPLOYMENT.md`, `REFLECTION.md` | Deployment evidence; one-page reflection on the demonstration run | Committed |
| `JOURNAL.md` | Build journal — corrections #11–#17, rejected decisions, platform notes | Committed |
| `.harness/agents/*.agent.md` | Agent definitions — planner, generator, evaluator, monitor | Committed |
| `.harness/skills/*/SKILL.md` | Feedforward context — 8 skills | Committed |
| `.harness/bin/verdict.mjs` | Deterministic verdict calculator — the executable copy of `grading-criteria` §5 | Committed |
| `.harness/output/` | Live run files: `spec.md`, `sprint-N-contract.md`, `generator-summary.md`, `evaluator-feedback.md`, `sprint-N-checks.json`, `run-log.md`, `escalation.md` | **Gitignored during a run** |
| `.harness/reviews/` | Archived per sprint: `sprint-N-generator-summary.md`, `sprint-N-evaluator-feedback.md`, `sprint-N-run-log.md` (FAIL iterations as `sprint-N-iteration-i-*`) | Committed — governance audit trail |
| `.harness/reviews/` (demonstration feature) | **Run 1, retrospective:** the three files above per sprint. **Run 2, live loop:** `sprint-N-live-{generator-summary,evaluator-feedback,run-log}.md` + `sprint-N-live-checks.json`. Planner output from run 2, archived when the run completed: `spec.md`, `sprint-N-contract.md`. Cross-run comparison: `live-vs-retrospective.md` | Committed |
| `.harness-notes/` | Baseline scaffold corrections #1–#10 — source material for the skill files | Committed |
| `src/`, `tests/` | StoreOps application and its tests | Committed |
| `.github/workflows/ci.yml` | CI pipeline (§7): the same four gates, then build the image, run it, and check the 207 | Committed |
| `Dockerfile`, `.dockerignore`, `docker-compose.yml` | `node:20-alpine` multi-stage image; local compose | Committed |
| `deploy/cloudrun.sh`, `deploy/evidence/` | Manual Cloud Run deploy; captured 207 acceptance transcript | Committed |
| `package.json`, `tsconfig*.json`, `jest.config.ts`, `.eslintrc.cjs` | Build and gate configuration — check A11 / hard gate HG-A4 treats these as gate files that must not change | Committed |

Files in `.harness/output/` are **unqualified and overwritten** — `generator-summary.md`, not
`sprint-1-generator-summary.md`. So archiving is not optional bookkeeping: it is what stops sprint
N+1 from destroying sprint N's record.

**Archive rule.** A sprint's `generator-summary.md` is copied to
`.harness/reviews/sprint-N-generator-summary.md` as soon as that sprint's Generator run **ends**,
whatever the verdict — including a `FAIL`, where each iteration is archived as
`sprint-N-iteration-i-generator-summary.md`. Waiting for a `PASS` to archive would lose the
evidence of every run that did not pass, which is precisely the evidence a governance trail exists
to hold. `evaluator-feedback.md` and `run-log.md` are archived on the same trigger, per verdict.

No Generator or Evaluator invocation for sprint N+1 may begin until sprint N's artefacts are
archived. That archive is the permanent record: it is what surfaces a recurring finding across
sprints and tells you which skill file needs tightening.

## 9. Commands

Run from the repository root. These are the harness gates and the CI gates both.

| Purpose | Command | Requirement |
|---|---|---|
| Type check | `npx tsc --noEmit` | 0 errors |
| Lint | `npx eslint .` | 0 errors |
| Tests + coverage | `npx jest --coverage` | All pass; service ≥80%, routes ≥70%, shared ≥60%, overall ≥70% |
| Architecture invariants | `npx jest tests/shared/architecture.test.ts` | Passes |
| Build | `npm run build` | 0 errors |
| Run | `npm start` | Listens on `:3000` |

Manual verification uses seeded bearer tokens (`token-manager`, `token-lead`, `token-associate`,
`token-regional`) — see `.harness/skills/app-context/SKILL.md` §5.
