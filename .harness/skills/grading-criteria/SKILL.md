# Skill: grading-criteria

**Purpose.** The scoring system: two weighted dimensions, their checks with explicit pass/fail
criteria, the hard gates that override scoring entirely, and the verdict rule table. This file
makes the verdict a **function of the check results** rather than a judgement call.

**Read by:** evaluator (and monitor, to interpret a verdict).

---

## 1. Dimensions and weights

Two dimensions. Weights sum to **100%**.

| Id | Dimension | Weight | Why this dimension for StoreOps |
|---|---|---|---|
| **DIM-A** | Architecture compliance | **55%** | The harness exists because AI-generated code drifted from module boundaries, the error contract, and the event bus. These are the four client failure modes. Weighted highest because a boundary breach is invisible at runtime and expensive later — it passes tests and rots the design |
| **DIM-B** | Contract fulfilment and test substance | **45%** | A feature that compiles but does not do what the contract specified, or is "covered" by tests that assert only status codes, is failure mode 3. Weighted slightly lower only because its defects are visible; they are not less serious |

Each dimension is scored **0–100** from its checklist, then weighted:
`total = 0.55 × DIM-A + 0.45 × DIM-B`.

**Findings do not deduct; failed checks do.** The score is a pure function of the check results, so
severity never moves a number on its own. That keeps the arithmetic reproducible. The link between
the two is a rule: **a MAJOR finding must cite the check it fails.** If a concern fails no check,
it is a MINOR or a NOTE — or the checklist is missing a check, which is a skill-file gap for the
Monitor to raise. BLOCKER findings are the one exception: they force FAIL directly through the
verdict table (§5), independent of score.

## 2. Checklists

Each check is **binary**: PASS, FAIL, `UNDETERMINED`, or `n/a`. `n/a` checks are removed from the
denominator. A dimension's score is `100 × (passed / applicable)` rounded to the nearest integer.
`UNDETERMINED` counts as FAIL for scoring (see `how-to-review` §7).

### DIM-A — Architecture compliance (55%)

| Check | Criterion (PASS means) | Method | Hard gate |
|---|---|---|---|
| A1 | `npx jest tests/shared/architecture.test.ts` exits 0 | Automated | **HG-A1** |
| A2 | `npx eslint .` reports 0 errors | Automated | **HG-A2** |
| A3 | No file in the diff imports another module's `repository` (R1) | Grep + read | |
| A4 | Every cross-module read in the diff goes through a service, injected via constructor (R1) | Read | |
| A5 | Every cross-module effect is an `emit()`; no sibling service imported for an effect outside `src/app.ts` (R2) | Grep + read | **HG-A3** |
| A6 | Every event name used exists in `shared/events/events.types.ts`; subscribers registered only in `src/app.ts` (R2) | Read | |
| A7 | Every thrown error is an `AppError` subclass, and the subclass is semantically correct (R3) | Read | |
| A8 | Every `ValidationError` in the diff carries `{ field }` details (R3) | Read | |
| A9 | No route contains a business rule or authorization decision; no service references `req`/`res`; no repository validates, emits, or calls a service (R4) | Read | |
| A10 | `reports` performs no `create`/`update`/`delete` on another module (R5) | Grep | |
| A11 | No gate was weakened: `architecture.test.ts`, `.eslintrc.cjs`, `jest.config.ts` thresholds, `tsconfig*.json` unmodified | `git diff --name-only` | **HG-A4** |
| A12 | No new runtime dependency in `package.json` | `git diff package.json` | |
| A13 | Code matches `coding-conventions`: enum+guard pattern, explicit member accessibility, immutable repository updates, `nowIso()`/`newId()` helpers, no inline role checks | Read | |

### DIM-B — Contract fulfilment and test substance (45%)

| Check | Criterion (PASS means) | Method | Hard gate |
|---|---|---|---|
| B1 | `npx tsc --noEmit` reports 0 errors | Automated | **HG-B1** |
| B2 | `npx jest --coverage` — all tests pass and every threshold is met (service 80 / routes 70 / shared 60 / overall 70) | Automated | **HG-B2** |
| B3 | Every AC's **business rule** is verified: no AC is `UNMET` or `NOT_ASSESSED`, and no `PARTIAL` whose uncovered portion *is* the business rule | Read | **HG-B3** |
| B4 | Every AC's **Verified by** test exists under that name and passed | Read + jest output | |
| B5 | Every negative-path test asserts state is unchanged, not only that an error was thrown (R6) | Read | |
| B6 | Every new event has both a positive assertion and a negative assertion (no event when nothing changed) (R6) | Read | |
| B7 | No route test whose only assertion is a status code (R6) | Read | |
| B8 | Every new error branch has a test naming its `AppError` subclass | Read | |
| B9 | Only files listed in the contract's expected-changes table were modified, or any extra is declared in *Deviations* | `git diff --name-only` vs contract | |
| B10 | Nothing from a later sprint was implemented | Read vs spec §5 | |
| B11 | The Generator's `GATES:` line matches the Evaluator's own re-run | Compare | |
| B12 | Manual verification in the contract's gate list was performed and its output recorded | Read summary | |
| B13 | No AC is `PARTIAL` — every clause of every AC's THEN is covered, not just the business rule | Read | |

**Why B3 and B13 are separate.** An AC can state a true business rule *and* an incidental detail
that turns out to be wrong — a field name, a count, a fixture that does not exist. If the business
rule is verified, blocking the sprint punishes the Generator for the Planner's imprecision; if the
imprecision costs nothing, nobody ever fixes the contract. So B3 (hard gate) asks "is the rule
proven?" and B13 (soft) asks "was the contract accurate?". A defective AC therefore scores a
deduction and a MAJOR finding routed back to the Planner, not a FAIL.

## 3. Hard gates — order of application

Applied **before** any scoring, in this exact order. The first failure ends the review: verdict is
`FAIL`, remaining checks are recorded `NOT_ASSESSED`, and the finding is a BLOCKER.

| # | Gate | Check | Type | Failure mode it prevents |
|---|---|---|---|---|
| 1 | **HG-A4** | A11 — no gate weakened | Automated (`git diff --name-only`) | The one unrecoverable failure: a harness that edits its own gates cannot govern anything. Checked first, because every later gate's result is meaningless if the gate itself was altered |
| 2 | **HG-B1** | B1 — `tsc --noEmit` 0 errors | **Automated tool check** | Broken build. Also catches TS6133 vestigial parameters (baseline correction #2) |
| 3 | **HG-A2** | A2 — `eslint .` 0 errors | **Automated tool check** | Failure mode 2 — raw `Error` throws, banned by `no-restricted-syntax` in services and routes |
| 4 | **HG-A1** | A1 — `architecture.test.ts` exits 0 | **Automated tool check** | Failure modes 1 and 4 — cross-module repository imports, `reports` mutations, routes touching repositories |
| 5 | **HG-B2** | B2 — `jest --coverage` green, thresholds met | **Automated tool check** | Untested or under-tested code |
| 6 | **HG-A3** | A5 — no sibling service imported for an effect | LLM-assessed + grep | Failure mode 4 — effects written directly instead of raised as events. Grep-supported but not fully automatable, so it is the one LLM-assessed hard gate |
| 7 | **HG-B3** | B3 — every AC `MET` | LLM-assessed | Failure mode 3 — a criterion that nothing actually verifies |

**§5.4 compliance:** DIM-A has three automated hard gates (HG-A4, HG-A2, HG-A1); DIM-B has two
(HG-B1, HG-B2). Both dimensions exceed the "at least one automated tool check per dimension"
requirement.

### Why each hard gate cannot be a soft check

- **HG-A4** — a weakened gate is undetectable downstream. Scoring it would let a 95% score bury it.
- **HG-B1/HG-A2/HG-A1/HG-B2** — deterministic, binary, and zero-cost to run. A tool result that
  contributes a *fraction* of a score invites the argument "94% is good enough", which is exactly
  the leniency drift §5.4 warns about.
- **HG-A3** — a missing event does not fail any tool check. The code works; the architecture is
  broken. It is invisible until a second module needs the same signal, so it must block.
- **HG-B3** — an unverified criterion means the feature is unproven. Coverage can be 97% while the
  one business rule the sprint existed for is unasserted (see correction #11).

## 4. Thresholds

| Band | Requirement |
|---|---|
| PASS | All 7 hard gates PASS **and** weighted total ≥ **85** **and** zero BLOCKER findings |
| CONDITIONAL PASS | All 7 hard gates PASS **and** weighted total **70–84** **and** zero BLOCKER findings |
| FAIL | Any hard gate FAIL, **or** weighted total < 70, **or** any BLOCKER finding |

`CONDITIONAL PASS` advances the sprint but carries its MAJOR findings forward as required rework
in the next sprint's Generator invocation (`CLAUDE.md` §4). It exists so a sprint with real but
non-structural weaknesses is not blocked, while the debt stays visible in the audit trail.

## 5. Verdict rule table — the deterministic core

```
IF any hard gate == FAIL                      → FAIL
ELSE IF any hard gate == UNDETERMINED         → ESCALATE (ambiguous evaluation)
ELSE IF any finding severity == BLOCKER       → FAIL
ELSE IF weighted_total >= 85                  → PASS
ELSE IF weighted_total >= 70                  → CONDITIONAL PASS
ELSE                                          → FAIL
```

Evaluated top to bottom; first match wins. No other inputs. Not the Generator's confidence, not
the number of findings, not how close a score is to a boundary.

**This table is executed, not interpreted.** The Evaluator records its check results as JSON and
runs:

```bash
node .harness/bin/verdict.mjs .harness/output/sprint-N-checks.json
```

The script computes both dimension scores, the weighted total, and the verdict, and prints a
canonical `VERDICT BLOCK` that is pasted verbatim into `evaluator-feedback.md`. Identical input
JSON therefore produces byte-identical output — the arithmetic and the threshold comparison cannot
drift between two runs of the same review, and determinism is verifiable with `diff` rather than
asserted.

## 6. Escalation triggers

Independent of the score. Any of these halts the loop instead of producing a verdict:

| Trigger | Why |
|---|---|
| Any hard gate `UNDETERMINED` | The Evaluator's own output is ambiguous — §5.4 requires a defined fallback, and guessing breaks determinism |
| Iteration 3 still `FAIL` | Iteration budget exhausted (`CLAUDE.md` §5) |
| Two consecutive iterations with an identical BLOCKER finding | The loop is not converging; more iterations will not help |
| A BLOCKER whose fix requires changing the contract | Only the Planner may change a contract |
| A BLOCKER whose fix requires weakening a gate | Never automatic. A human decides whether the gate is wrong |

Escalation output format: `CLAUDE.md` §5.

## 7. Worked example — variable output, single verdict

Generator delivers the bulk-status service. Check results: DIM-A all 13 applicable PASS except A13
(a hand-rolled status comparison instead of the `isBulkStatusTarget` guard) → 12/13 = 92.
DIM-B: B1–B12 applicable, B5 FAIL (the cross-store test asserts the outcome but never re-reads the
activity) → 11/12 = 92.

Hard gates: all 7 PASS. B5 is a MAJOR, not a BLOCKER — the business rule *is* asserted, just not
the state. No BLOCKERs.

`total = 0.55 × 92 + 0.45 × 92 = 92` → **PASS** (≥85), with two findings carried as NOTEs for the
Monitor's trend line.

Change one thing: the cross-store test asserts nothing about the foreign activity at all, so AC-1.3
is `PARTIAL`. Now HG-B3 FAILs → **FAIL** at hard-gate stage, regardless of the 92. Same code, same
diff, different check result, mechanically different verdict — and both runs are reproducible.
