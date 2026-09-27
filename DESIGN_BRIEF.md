# Harness Design Brief — StoreOps Development Harness

**Author:** Soumen Choudhury
**Programme:** Cognizant AI-Native Tech Architect — Case Study 1, Build Track
**Repository:** https://github.com/c-soumen/storeops-harness
**Demonstration feature:** Shift handover bulk status update — `PATCH /api/activities/bulk-status`
**Stack:** Node.js 20 LTS / TypeScript 5.x (strict) / Express 4.x / Jest + supertest / ESLint

This brief is the architectural reasoning behind the working harness. It covers four sections:
intent decomposition (§A), governance framework (§B), non-determinism strategy (§C), and key
architectural decisions (§D). The four sections mirror the four graded dimensions in the rubric.

---

## §A — Intent Decomposition

The demonstration feature is one sentence in `PROMPT.md`: outgoing shift staff mark many
activities `DONE` or `BLOCKED` in a single request, with partial-failure reporting and an audit
entry per updated task. The Planner turns that sentence into `spec.md` (108 lines) and two sprint
contracts (109 + 108 lines) that the Generator implements without further clarification.

### Sprint boundary — where the cut was made and why

| Sprint | Owns | Depends on |
|---|---|---|
| 1 | `ActivityService.bulkUpdateStatus` — types, repository lookup, service method, unit tests, per-item classification, audit event emission | Nothing new |
| 2 | `PATCH /api/activities/bulk-status` — route, request shaping, `207 Multi-Status`, route tests, curl verification, alert delta assertion | Sprint 1's types and method |

**Why two sprints, not one.** The classification logic (updated / unchanged / not\_found /
forbidden) is the hard part; the HTTP surface is a thin transport over it. Bundling them means a
review finding on classification forces a re-review of the route. Splitting isolates the concerns
so each contract can pass on its own evidence.

**Why not three.** The audit events are a two-line emit inside the loop built in sprint 1 and
cannot be observed without the route from sprint 2. A dedicated events sprint would be
book-keeping.

### AC discipline — what makes a criterion testable rather than subjective

Every AC is `GIVEN <state> WHEN <action> THEN <observable outcome>` followed by a `Verified by:`
line naming the exact test that proves it. Testability is enforced by three rules:

1. **THEN clauses assert observable state, not intent.** Every criterion re-reads the affected
   entity (`getTask`, `repository.count()`) after the action to prove non-updated rows were left
   alone. Failure mode 3 in the client context — "tests asserted HTTP status codes but did not
   verify business rule compliance" — is the exact defect this rule prevents.
2. **Field names in an AC must resolve on the domain type.** Introduced as correction #11 after
   AC-2.6 named `body` when the id lives in `title`; the Planner now hard-fails a decomposition
   in which any asserted field is absent from the type.
3. **Every AC pins a specific test name.** The Evaluator's B4 check greps the test suite for that
   exact string. A missing test is a `PARTIAL` result and a MAJOR finding, not a review comment.

### Example — AC-1.6 in full

```
GIVEN an authenticated STORE_MANAGER (`token-manager`, `store_001`) and a
      `task.sla_breached` subscriber on the service's EventBus
WHEN  `bulkUpdateStatus` is called with `["act_restock_aisle4"]` and status `BLOCKED`
THEN  the subscriber is called once with `taskId: "act_restock_aisle4"`, `priority: "HIGH"`,
      AND the payload key-set is identical to the one `updateTask` emits for the same transition
Verified by: tests/activities/service.test.ts — "raises an SLA breach for each activity moved to BLOCKED"
```

The last clause is the interesting one. It compares the payload shape emitted by the bulk path
against the payload the pre-existing single-update path emits for the same state transition. The
two paths now cannot diverge without a test failing — failure mode 4 (missing/divergent event
integration) is closed **structurally**, not by reviewer vigilance. Sprint 2's evaluator feedback
records the corresponding evidence at the HTTP level: `src/alerts/**` was never modified in either
sprint, and the new endpoint still produced the correct alert for its assignee, because the effect
travels over the event bus.

---

## §B — Governance Framework

The harness encodes StoreOps standards in three artefacts: **skill files** (feedforward context
that each agent reads before acting), **agent files** (what each agent's responsibility is), and
the `.harness/reviews/` **archive** (the permanent audit trail). CLAUDE.md is the orchestrator;
`.harness/bin/verdict.mjs` is the executable copy of the verdict rule table.

### Skill file strategy — 8 skills, chosen deliberately

| Skill | Reader | What it encodes (StoreOps-specific) |
|---|---|---|
| `app-context` | Planner, Generator, Evaluator, Monitor | Module map, dependency direction, 5 domain enums with `is*` guards, 9 endpoints + baseline extras, seeded tokens/fixtures |
| `architecture-principles` | Planner, Generator, Evaluator | R1–R6, each with the client's failure-mode citation, compliant + non-compliant example lifted from the codebase, and the exact check that catches a violation |
| `sprint-decomposition` | Planner | Sprint sizing heuristics; GIVEN/WHEN/THEN template; field-name-must-resolve self-check (correction #11) |
| `coding-conventions` | Generator | `tsconfig` strict flags, ban on raw `Error`, `nullableString` PATCH helper, `prestart: npm run build` |
| `api-integration` | Generator | Route ordering hazard (literal path before `:id`), `asyncHandler` requirement, seeded tokens, 207-vs-4xx choice for batch endpoints |
| `how-to-test` | Generator | Coverage thresholds per layer, negative-event assertions, `isolatedModules` for jest performance, seed-must-not-be-extended rule |
| `how-to-review` | Evaluator | Check application order, hard-gate priority, finding severity → check-failure link |
| `grading-criteria` | Evaluator, Monitor | Two weighted dimensions (55/45), 7 hard gates, verdict rule table (executed by `verdict.mjs`) |

**Shared vs specialised.** `app-context` and `architecture-principles` are shared because every
agent needs the same picture of StoreOps to avoid producing contradictory artefacts. The other six
are single-reader — the Generator does not need to know how the Evaluator scores, only what would
score well.

**StoreOps-specific, not generic.** Every rule cites the codebase directly: the R2 event-bus
example names `task.sla_breached`; the coding-conventions PATCH rule names `nullableString`; the
api-integration route-ordering warning names `PATCH /:id`. A skill file that could apply to any
REST API would fail the reviewer's traceability test in the rubric.

### The archive as audit trail — what makes `.harness/reviews/` load-bearing

Every sprint produces three files that are archived on the same trigger — the end of the
Generator run, **not** on a PASS. Archive-on-PASS was the original design and became correction
#12: two back-to-back sprints would silently overwrite the earlier record, and a FAIL iteration
would never be archived at all — precisely the evidence a governance trail exists to hold.

For this feature the archive holds six files (two sprints × three artefacts): the Generator's
self-declared `generator-summary.md`, the Evaluator's independent `evaluator-feedback.md`, and the
Monitor's `run-log.md`. Anyone with repository access can reconstruct: what the Generator built,
what the Evaluator found, what the verdict was, how many iterations were consumed, and which
findings were routed to which agent for the next sprint.

**How this surfaces a recurring quality issue.** The Monitor reads the archive and flags
repetition. In this feature, the same defect class — an acceptance criterion asserting against
a domain shape without verifying the shape existed — appeared in sprint 1 (AC-1.3 referencing a
non-existent `store_002` fixture) and sprint 2 (AC-2.6 naming `body` when the value lives in
`title`). Two occurrences is the Monitor's threshold to stop treating it as bad luck; it produced
correction #11, which became a Planner hard gate and a new self-check in the
`sprint-decomposition` skill. Without the archive, the second occurrence would have looked like
an isolated review comment.

### Traceable rule — R2 Event bus only

**The rule.** Side effects that cross a module boundary are raised via `EventBus.emit()`. A
module never imports a sibling service to perform the effect. Reads are different: a cross-module
read through a service is R1-compliant; a cross-module write or notification must be an event.

**What breaks without it.** The client's failure mode 4 — state changes written directly to
sibling module repositories, and alerting logic scattered across the modules that trigger it. In
StoreOps concretely: if `activities.bulkUpdateStatus` imported `alertService.createNotification`,
every future feature that changes activity state would have to remember to raise the same
notification, in the same shape, with the same channel-selection logic. The `alerts` module's
own composition of SLA_BREACH messages would drift as callers reimplement it inconsistently. A
future change to the alerting policy (e.g., escalate CRITICAL breaches to email) would touch
every caller.

**The evidence that the rule held.** Sprint 2's evaluator feedback records that `src/alerts/**`
was not modified in either sprint, and the manual curl gate produced a live `SLA_BREACH`
notification for the correct assignee when the new endpoint was called. The single-item PATCH
path and the new bulk path emit `task.sla_breached` with the same payload key-set (AC-1.6). The
seam absorbed a whole new caller without cracking — the architectural claim R2 makes.

**How the Evaluator enforces it.** LLM-assessed, backed by two mechanical signals:
`architecture.test.ts` fails if any `routes.ts` imports a repository; a new
`import { alertService }` or `import { reportService }` anywhere outside `src/app.ts` is a strong
indicator the rule has been broken and is flagged as a hard-gate-review candidate. The
combination is `grading-criteria` hard gate HG-A3.

---

*Sections §C (Non-Determinism Strategy) and §D (Architectural Decisions) will be added on
Day 12–13 alongside the deployment step. They cover the executable verdict calculator, the
retrospective-vs-live-loop evaluation caveat, and the four self-caught corrections (#11–#14) that
became structural improvements rather than one-off fixes.*
