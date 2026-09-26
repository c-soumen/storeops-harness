# Evaluator Feedback — Sprint 1, Iteration 1

**Contract:** sprint-1-contract.md
**Generator summary:** sprint-1-generator-summary.md (iteration 1)
**Reviewed diff:** `29111ec..614c5c2` — 4 files, +364/−2
**Evaluated:** 2026-09-26

**Evaluation is retrospective.** The Evaluator was built on Day 7–9, after both sprints had been
generated, so this review was not run in the live loop position. Consequence: the four gates were
re-run at `e60b6c7` (which includes sprint 2), not at `614c5c2`. The contemporaneous result at
sprint-1 time was independently observed and recorded (227 tests, 12 suites, 97.08%/91.02%). Both
observations agree, so no check result turns on the difference — but check B11 is recorded as PASS
against the current run, not a historical one. See *Deviations* in the run log.

## 1. Gate re-run (independent)

| Gate | Command | Evaluator result | Generator claimed | Match |
|---|---|---|---|---|
| Type check | `npx tsc --noEmit` | 0 errors | `tsc=PASS` | ✅ |
| Lint | `npx eslint .` | 0 errors | `eslint=PASS` | ✅ |
| Tests | `npx jest --coverage` | 232 passed, 12 suites; 97.03% stmts, 90.30% br, 95.85% fn, 97.02% ln; thresholds met | `jest=PASS` (227 at the time) | ✅ |
| Architecture | `npx jest tests/shared/architecture.test.ts` | 14 passed, 0.5s | `architecture=PASS` | ✅ |

No `GATE-MISMATCH`.

## 2. Hard gates

All 7 PASS — see the VERDICT BLOCK in §8, which is authoritative.

## 3. Acceptance criteria verification

| AC | Result | Verified by (found?) | Evidence / gap |
|---|---|---|---|
| AC-1.1 | MET | ✅ "updates every activity in the batch" | Asserts `requested: 2`, `updated: 2`, exact `results` array, and both activities re-read as DONE via `getTask` |
| AC-1.2 | MET | ✅ "reports per-item outcomes without failing the whole batch" | Called as DEPARTMENT_LEAD per the AC; `updated: 1`; both item shapes asserted; "no exception propagates" evidenced by the awaited call resolving |
| AC-1.3 | MET | ✅ "refuses activities from another store without touching them" | `store_002` activity arranged in-test per the contract's arrangement note; asserts `forbidden` + `code: FORBIDDEN` **and** re-reads the foreign activity as `TODO` |
| AC-1.4 | MET | ✅ "reports unchanged and emits nothing when already in the target status" | `updated: 0`, outcome `unchanged`, and `handler).not.toHaveBeenCalled()` — the negative event assertion R6 requires |
| AC-1.5 | MET | ✅ "emits one status_changed event per changed activity" | Exactly 2 emissions for 2 changed + 1 unknown; both payloads assert `previousStatus` and `actorId` |
| AC-1.6 | MET | ✅ "raises an SLA breach for each activity moved to BLOCKED" | Emission count + `priority: HIGH`, plus a key-set comparison against the `updateTask` payload for the same transition |
| AC-1.7 | MET | ✅ "throws ValidationError for request-level problems" | All four cases; `details.field` asserted per case; state re-read and `repository.count()` asserted unchanged |
| AC-1.8 | MET | ✅ "deduplicates repeated ids" | `requested: 1`, one result, `updated: 1`, one emission |

8 of 8 MET. Every test was confirmed present by name and passing in the Evaluator's own run.

## 4. Dimension checks

### DIM-A — Architecture compliance (55%) — 11/11 applicable → 100

| Check | Result | Evidence |
|---|---|---|
| A1 | PASS | `architecture.test.ts` 14/14 |
| A2 | PASS | `eslint .` 0 errors |
| A3 | PASS | `grep '\.\./[a-z]*/repository' src/` → no cross-module hits |
| A4 | n/a | The diff introduces no cross-module read — bulk scoping uses `caller.storeId` and the activity's own `storeId` |
| A5 | PASS | No `alertService`/`reportService` import outside `src/app.ts` |
| A6 | PASS | Both emitted events (`task.status_changed`, `task.sla_breached`) pre-exist in `events.types.ts`; no new subscriber registered |
| A7 | PASS | `service.ts:183,199,202` — request-level failures are `ValidationError`. Per-item failures are classified, not thrown, as the contract specifies |
| A8 | PASS | All three `ValidationError`s carry `{ field }` (`status`, `ids`, `ids`) |
| A9 | PASS | `repository.ts:findByIds` only looks up; `service.ts` owns validation/authorization/classification/emission; no `req`/`res` in the service |
| A10 | n/a | `reports` untouched |
| A11 | PASS | `git diff --name-only 29111ec..614c5c2` over `architecture.test.ts`, `.eslintrc.cjs`, `jest.config.ts`, `tsconfig*.json`, `package.json` → empty |
| A12 | PASS | `package.json` unchanged since baseline |
| A13 | PASS | Uses the `isBulkStatusTarget` guard rather than a hand-rolled chain; explicit `public`; immutable update via `repository.update`; no inline role check |

### DIM-B — Contract fulfilment and test substance (45%) — 11/11 applicable → 100

| Check | Result | Evidence |
|---|---|---|
| B1 | PASS | `tsc --noEmit` 0 errors |
| B2 | PASS | 232 passed; service/routes/shared/overall thresholds all met |
| B3 | PASS | No AC `UNMET` or `NOT_ASSESSED`; no `PARTIAL` |
| B4 | PASS | All 8 named tests exist under their contract names and passed |
| B5 | PASS | AC-1.3 re-reads the foreign activity; AC-1.7 re-reads state and asserts `count()` |
| B6 | PASS | Positive (AC-1.5, AC-1.6) and negative (AC-1.4) event assertions both present |
| B7 | n/a | No route tests in this sprint |
| B8 | PASS | Every `ValidationError` branch is covered by AC-1.7 |
| B9 | PASS | Exactly the 4 files in the contract's table; no extras |
| B10 | PASS | `routes.ts` untouched — nothing from sprint 2 implemented |
| B11 | PASS | Generator `GATES:` line matches the Evaluator's re-run (see the retrospective caveat above) |
| B12 | n/a | Sprint 1's contract lists no manual verification gate |
| B13 | PASS | No AC `PARTIAL` |

## 5. Findings

### F-1 — [MINOR] Boundary value at the batch cap is untested
**File:** `src/activities/service.ts:201`
**Check:** none failed (B13 PASS — the contract never specified a 50-id case)
**Observed:** AC-1.7 tests 51 ids (rejected). A batch of exactly 50 is never exercised, so an
off-by-one in `ids.length > BULK_MAX_ITEMS` would not be caught.
**Required:** Nothing for this sprint — the contract did not ask for it.
**Fix:** Deferred. Closing it needs 50 activities, which the "do not extend seeds" rule forbids;
the honest options are a test-local factory loop or accepting the gap. Routed to the Monitor as a
`how-to-test` skill-file candidate: boundary values where fixtures cannot be extended.

### F-2 — [NOTE] `results` ordering is an undeclared contract
**File:** `tests/activities/service.test.ts` (AC-1.1)
**Observed:** The test asserts `results` by exact array order; the contract never specified
ordering. The assumption is currently safe (the loop is sequential) but is now pinned by a test.
**Required:** Nothing. The Generator declared this in its own known gaps — correctly.

### F-3 — [NOTE] `findByIds` is now public repository API
**File:** `src/activities/repository.ts:47`
**Observed:** O(n) over the input, correct for a `Map`. A future SQL-backed repository would want
a single `IN` query. Declared by the Generator.

No BLOCKER and no MAJOR findings.

## 6. Known-gap adjudication

| Generator-declared gap | Evaluator position | Effect on verdict |
|---|---|---|
| 50-item cap boundary untested | **Accepted.** Outside the contract; closing it conflicts with the seed rule. Recorded as F-1 | None |
| `findByIds` O(n) / future SQL shape | **Accepted.** Correct for the current storage model | None |
| `results` ordering assumption | **Accepted**, and valuable — it names an assumption a later change could break | None |
| Route/app/event-type files untouched as instructed | **Confirmed** by `git diff --name-only` | None |

All four gaps were disclosed before review. None is converted into a finding beyond the NOTEs
above, per `how-to-review` §6 — punishing disclosure teaches the next run to hide it.

## 7. Strengths (NOTEs for the Monitor's trend line)

- **AC-1.6's payload key-set comparison** pins the bulk and single-update emissions to the same
  shape. The two paths now cannot diverge without a test failing — failure mode 4 addressed
  structurally rather than by review vigilance.
- **AC-1.7 asserts state as well as rejection** (`getTask` + `repository.count()`), which is
  exactly the R6 discipline the baseline's failure mode 3 was about.
- **Idempotency was decided in the contract, not improvised** — `unchanged` emits nothing, so a
  retried handover cannot double the audit trail.
- **Zero deviations from the contract**, and the specified type names were honoured, which is what
  let sprint 2 build against them without rework.

## 8. Verdict

```
--- VERDICT BLOCK (generated by .harness/bin/verdict.mjs) ---
SPRINT: 1 of 2
ITERATION: 1

Hard gates, in order of application:
| # | Gate | Dim | Check | Type | Result |
|---|---|---|---|---|---|
| 1 | HG-A4 | A | A11 | automated    | PASS |
| 2 | HG-B1 | B | B1  | automated    | PASS |
| 3 | HG-A2 | A | A2  | automated    | PASS |
| 4 | HG-A1 | A | A1  | automated    | PASS |
| 5 | HG-B2 | B | B2  | automated    | PASS |
| 6 | HG-A3 | A | A5  | llm-assessed | PASS |
| 7 | HG-B3 | B | B3  | llm-assessed | PASS |

Dimension scores:
| Dim | Dimension | Weight | Passed/Applicable | Score |
|---|---|---|---|---|
| A | Architecture compliance | 55% | 11/11 | 100 |
| B | Contract fulfilment and test substance | 45% | 11/11 | 100 |

WEIGHTED TOTAL: 100
BLOCKER FINDINGS: 0
DECISION RULE: all hard gates passed and weighted total 100 >= 85

VERDICT: PASS
--- END VERDICT BLOCK ---
```

Check results: `.harness/output/sprint-1-checks.json` (SHA of the block: `2f42f201…`)

---
VERDICT: PASS
SPRINT: 1 of 2
ITERATION: 1
NEXT: ADVANCE
