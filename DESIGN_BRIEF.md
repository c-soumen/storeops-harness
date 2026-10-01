# Harness Design Brief — StoreOps Development Harness

**Author:** Soumen Choudhury
**Programme:** Cognizant AI-Native Tech Architect — Case Study 1, Build Track
**Repository:** https://github.com/c-soumen/storeops-harness
**Demonstration feature:** Shift handover bulk status update — `PATCH /api/activities/bulk-status`
**Stack:** Node.js 20 LTS / TypeScript 5.x (strict) / Express 4.x / Jest + supertest / ESLint

The architectural reasoning behind the working harness, in four sections that mirror the rubric.

---

## §A — Intent Decomposition

`PROMPT.md` is one sentence: outgoing shift staff mark many activities `DONE` or `BLOCKED` in one
request, with partial-failure reporting and an audit entry per updated task. The Planner turns it
into `spec.md` and two sprint contracts, which the Generator implements without clarification.

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

StoreOps standards live in **skill files** (read before acting), **agent files** (responsibilities),
and the `.harness/reviews/` **archive** (audit trail), orchestrated by `CLAUDE.md`.

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

**Shared vs specialised.** `app-context` and `architecture-principles` are shared so every agent
works from one picture of StoreOps. The other six are single-reader: the Generator needs to know
what scores well, not how the Evaluator scores.

**StoreOps-specific, not generic.** Every rule cites the codebase: R2 names `task.sla_breached`,
the PATCH rule names `nullableString`, the route-ordering warning names `PATCH /:id`.

### The archive as audit trail — what makes `.harness/reviews/` load-bearing

Every sprint produces three files that are archived on the same trigger — the end of the
Generator run, **not** on a PASS. Archive-on-PASS was the original design and became correction
#12: two back-to-back sprints would silently overwrite the earlier record, and a FAIL iteration
would never be archived at all — precisely the evidence a governance trail exists to hold.

Each sprint archives `generator-summary.md` (self-declared), `evaluator-feedback.md`
(independent), and `run-log.md`. Both runs are kept: retrospective, live (`sprint-N-live-*`),
and a comparison of the two. Anyone with repository access can reconstruct what was built, what
was found, the verdict, the iterations, and where each finding was routed.

**How this surfaces a recurring quality issue.** The Monitor reads the archive and flags
repetition. Both sprints had an AC asserting against an unverified domain shape: AC-1.3 used a
non-existent `store_002` fixture, and AC-2.6 named `body` for a value in `title`. Two occurrences
is the Monitor's threshold. It produced correction #11, a Planner hard gate plus a
`sprint-decomposition` self-check. Without the archive, the second would have looked isolated.

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

## §C — Non-Determinism Strategy

Variable LLM output becomes a stable verdict through three layers: binary check results, an
executable verdict rule, and an escalation path for when the review cannot decide.

### Two dimensions, weighted 55 / 45

`DIM-A — Architecture compliance (55%)` and `DIM-B — Contract fulfilment and test substance
(45%)`. `verdict.mjs` refuses to run unless the weights sum to 100.

The 10-point tilt is deliberate. Three of the four client failure modes are architectural:
cross-module repository imports, raw `Error` throws, and missing event-bus integration. They
compile, they pass tests, and they rot the design invisibly. Failure mode 3 (status-code-only
tests) is the `DIM-B` concern, weighted slightly lower because its defects are visible at review
time. A 50 / 50 split would treat "the design is wrong" and "the test is thin" as equally
recoverable.

### Seven hard gates, applied before any scoring

The gates are applied top to bottom. The first failure ends the review with `VERDICT: FAIL`, and
every remaining check is recorded `NOT_ASSESSED`. There is no partial credit, because a partial
score invites negotiation over a gate that is not negotiable.

| # | Gate | Backing check | Type | Specific failure mode it prevents |
|---|---|---|---|---|
| 1 | **HG-A4** | A11 — no gate weakened | Automated (`git diff --name-only`) | A harness that edits its own gates cannot govern anything. Checked first because every later gate's result is meaningless if the gate itself moved |
| 2 | **HG-B1** | B1 — `tsc --noEmit` 0 errors | Automated tool check | Broken build. Also catches `TS6133` vestigial parameters (baseline correction #2 — the `StaffService.updateProfile` unused-caller case) |
| 3 | **HG-A2** | A2 — `eslint .` 0 errors | Automated tool check | **Client failure mode 2** — raw `throw new Error(...)` in services or routes, banned by `no-restricted-syntax`. Verified live: temporarily adding `throw new Error('raw')` to `alerts/service.ts` during baseline generation produced 2 lint errors |
| 4 | **HG-A1** | A1 — `architecture.test.ts` exits 0 | Automated tool check | **Client failure modes 1 and 4** — cross-module `../<other>/repository` imports, `reports` mutations, `routes.ts` touching a repository |
| 5 | **HG-B2** | B2 — `jest --coverage`, thresholds met | Automated tool check | Untested or under-tested code (service ≥80, routes ≥70, shared ≥60, overall ≥70) |
| 6 | **HG-A3** | A5 — no sibling service imported for an effect | LLM-assessed + grep | **Client failure mode 4 (structural)** — a missing event does not fail any tool check; the code works, the seam is broken. Invisible until a second module needs the same signal — must block, not deduct |
| 7 | **HG-B3** | B3 — every AC's business rule verified | LLM-assessed | **Client failure mode 3** — the sprint's business rule is unproven. Coverage can read 97% while the one criterion the sprint existed for is unasserted (correction #11's original trigger) |

Five gates are automated tool checks: three in DIM-A, two in DIM-B, which meets spec §5.4's
one-per-dimension minimum. The two LLM-assessed gates cover what automation cannot see, such as
an event that is never emitted.

### Verdict rule, executed rather than interpreted

```
IF any hard gate == FAIL           → FAIL
ELSE IF any hard gate == UNDETERMINED → ESCALATE (ambiguous evaluation)
ELSE IF any finding severity == BLOCKER → FAIL
ELSE IF weighted_total >= 85       → PASS
ELSE IF weighted_total >= 70       → CONDITIONAL PASS
ELSE                                → FAIL
```

The table in `grading-criteria/SKILL.md` §5 executes in `.harness/bin/verdict.mjs`. The Evaluator
writes its check results as JSON, runs
`node .harness/bin/verdict.mjs .harness/output/sprint-N-checks.json`, and pastes the
`VERDICT BLOCK` verbatim. The same JSON gives byte-identical output, which `diff` can verify.
Three runs on sprint 1's input (Day 7–9):

```
2f42f2012c0ff17f13ac8c1abe698f6fb6ec4f9ad843699e052d6a168bcfaf46  det-run1.txt
2f42f2012c0ff17f13ac8c1abe698f6fb6ec4f9ad843699e052d6a168bcfaf46  det-run2.txt
2f42f2012c0ff17f13ac8c1abe698f6fb6ec4f9ad843699e052d6a168bcfaf46  det-run3.txt
```

Two counter-tests ruled out a constant function: flipping B3 to FAIL gave `VERDICT: FAIL`, and
flipping A5 to UNDETERMINED gave `VERDICT: ESCALATE`.

**Limit 1.** Only the `VERDICT BLOCK` is byte-identical. The *Findings* prose varies between
runs. Spec §5.4 requires a reproducible **verdict**, not reproducible wording, and
`evaluator.agent.md` states that boundary.

**Limit 2, found by the live run** (`.harness/reviews/live-vs-retrospective.md`). Byte-identity
holds **given the same JSON**. It reproduced on both live inputs (`39f5b1af…` ×3,
`165f482b…` ×3), and the live verdicts matched the retrospective ones. Two independent Evaluators
still recorded four different check results (B5, B6, A6) on identical code, because the criterion
wording allows two readings. These are soft checks with headroom above 85, so no verdict moved.
The JSON is only as deterministic as the check definitions (correction #15).

### Escalation — the fourth verdict

Some situations should halt the loop and go to a human. That is not a harness failure; it is the
harness refusing to ship what it cannot verify.

Triggers, from `grading-criteria` §6:

- Any hard gate `UNDETERMINED` — the Evaluator's own output is ambiguous
- Iteration 3 still `FAIL` — iteration budget exhausted
- Two consecutive iterations with an identical BLOCKER — the loop is not converging
- A BLOCKER whose fix requires changing the contract — only the Planner may
- A BLOCKER whose fix requires weakening a gate — never automatic; a human decides

**Recipient:** the developer who invoked `@planner`. **Contents** (`CLAUDE.md` §5):
`escalation.md` gives the sprint, the iterations used, the verdict history, the gate status, and
the specific question the human must decide.

---

## §D — Architectural Decisions

### D-1 — Archive on run-end, not on PASS

**Decision.** A sprint's `generator-summary.md`, `evaluator-feedback.md`, and `run-log.md`
copy to `.harness/reviews/` when the Generator run **ends**, whatever the verdict — including
FAIL iterations, archived as `sprint-N-iteration-i-*`.

**Alternatives considered.**
- Archive on PASS only — the original design, and what shipped in the first draft of
  `CLAUDE.md`.
- Archive at end-of-feature only — one bundle per feature, no per-sprint history.

**Rationale.** The archive-on-PASS design silently overwrote sprint records: `.harness/output/`
files are unqualified (`generator-summary.md`, not `sprint-1-generator-summary.md`) and sprint
2 would clobber sprint 1's copy on disk before it ever reached `.harness/reviews/`. Every FAIL
iteration also went unarchived — precisely the evidence a governance trail exists to hold.
Caught as correction #12 when I asked the CLI to run both sprints back-to-back. Fixed in commit
`29111ec` before that commit landed. The reviews archive is now verdict-agnostic and the
orchestrator forbids sprint N+1 from starting until sprint N's artefacts are archived.

**Assumption it depends on.** That governance value comes from the archive being **complete**,
not tidy. A messier archive with every iteration beats a clean archive with only successes.

### D-2 — Executable verdict rule (`.harness/bin/verdict.mjs`), not LLM-only

**Decision.** The verdict is computed by a 175-line Node script that reads the Evaluator's
recorded check results as JSON and emits a canonical `VERDICT BLOCK`. The Evaluator then pastes
that block verbatim.

**Alternatives considered.**
- LLM-only verdict — the Evaluator reads its own checklist and states a verdict in prose.
- LLM-derived verdict + human sanity check — the LLM proposes, a human ratifies.

**Rationale.** The `grading-criteria` verdict rule is arithmetic and threshold comparison —
`total = 0.55 × DIM-A + 0.45 × DIM-B`, PASS at ≥85, CONDITIONAL at 70–84, FAIL below or on any
hard-gate breach. Asking an LLM to compute this is asking it to interpret a table it could just
execute, and interpretation is where drift starts. The `.mjs` copy is the executable form of
`grading-criteria` §5; if the weight, threshold, or rule order changes there, it changes here
too. Determinism becomes something `diff` can prove.

**Assumption it depends on.** That the `evaluator.agent.md` contract holds — the Evaluator
pastes the block verbatim and does not "correct" the verdict in prose. Enforced by convention
and by `how-to-review` §7: verdict by table, never by feel.

### D-3 — Split B3 / B13 in `grading-criteria`

**Decision.** Two separate checks on acceptance-criterion coverage:
- **B3 (hard gate)** — "Every AC's *business rule* is verified."
- **B13 (soft)** — "No AC is `PARTIAL` — every clause of every AC's THEN is covered."

An AC whose business rule is proven but whose incidental detail is wrong (a field name, a
count, a fixture) scores B3 PASS + B13 FAIL: MAJOR finding routed to the Planner, verdict
still PASS.

**Alternatives considered.**
- One combined check requiring every clause to pass — clean but punishes the Generator for the
  Planner's imprecision (would have failed sprint 2 for AC-2.6's wrong field name).
- One check on business rule only — invisible cost to contract sloppiness; nobody ever fixes
  the Planner.

**Rationale.** Correction #13, self-caught when the merged version applied to AC-2.6 produced
contradictory verdicts on the same evidence. The single-rule versions optimise for one thing
at the cost of another; splitting routes each failure to the agent that can fix it. A defective
contract does not stall a working Generator, and it also does not go unrecorded.

**Assumption it depends on.** That the Monitor actually surfaces the Planner findings — B13
FAILs accumulating in the archive without acting on them would be worse than a single hard
gate. Verified by correction #11 flowing back from the archive into a Planner self-check.

