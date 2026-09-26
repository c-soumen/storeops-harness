# Evaluator Feedback — Sprint 2, Iteration 1

**Contract:** sprint-2-contract.md
**Generator summary:** sprint-2-generator-summary.md (iteration 1)
**Reviewed diff:** `614c5c2..e663aae` — 2 files, +123
**Evaluated:** 2026-09-26

**Evaluation is retrospective** — same caveat as sprint 1. Gates re-run at `e60b6c7`, which for
sprint 2 *is* the tip of its own code, so only sprint 1's review is affected by the timing.

## 1. Gate re-run (independent)

| Gate | Command | Evaluator result | Generator claimed | Match |
|---|---|---|---|---|
| Type check | `npx tsc --noEmit` | 0 errors | `tsc=PASS` | ✅ |
| Lint | `npx eslint .` | 0 errors | `eslint=PASS` | ✅ |
| Tests | `npx jest --coverage` | 232 passed, 12 suites; 97.03% stmts, 90.30% br, 95.85% fn, 97.02% ln; thresholds met | `jest=PASS` (232) | ✅ |
| Architecture | `npx jest tests/shared/architecture.test.ts` | 14 passed | `architecture=PASS` | ✅ |
| Manual | bulk-status curl | 207 with three distinct outcomes in one body | performed, output recorded | ✅ |

No `GATE-MISMATCH`. Note the Generator's summary honestly records that its **first** gate run
failed at 231/232 and was fixed before submission — the `GATES:` line reflects the last run, as
`generator.agent.md` requires.

## 2. Hard gates

All 7 PASS — see the VERDICT BLOCK in §8.

## 3. Acceptance criteria verification

| AC | Result | Verified by (found?) | Evidence / gap |
|---|---|---|---|
| AC-2.1 | MET | ✅ "returns 207 with per-item outcomes" | 207; `requested: 2`, `updated: 1`; both result items asserted by exact shape |
| AC-2.2 | MET | ✅ "returns 207 when no item could be updated" | 207 with `updated: 0` — the batch-vs-item semantic the AC deliberately pins |
| AC-2.3 | MET | ✅ "returns 400 for request-level problems" | All three cases; asserts `error.code` and `error.details.field` per case, not just the status |
| AC-2.4 | MET | ✅ "returns 401 without a token" | 401 + `UNAUTHORIZED`, **and** re-reads the activity as `TODO` |
| AC-2.5 | MET | ✅ pre-existing "returns 200 with the updated activity" (unmodified) + curl | The single-item PATCH test passes untouched, which is exactly the regression signal the AC asked for. Independently confirmed by curl: `PATCH /api/activities/act_restock_aisle4` → 200 |
| AC-2.6 | **PARTIAL** | ✅ "raises an SLA alert for the assignee via the bulk endpoint" | Business rule **verified**: alert count +1, `type: SLA_BREACH`, and content naming the activity. But the AC's literal clause — "a **body** naming `act_restock_aisle4`" — is not satisfied: `Notification.body` holds `"Activity moved to BLOCKED (priority HIGH)."` and the id lives in `title`. See F-1 |

5 of 6 MET, 1 PARTIAL.

**Why this is not a hard-gate failure.** HG-B3 asks whether each AC's *business rule* is verified;
the uncovered portion here is a field name, not the rule. The alert is raised, to the right
recipient, with the right type, naming the right activity. Per `grading-criteria` B3/B13 this
scores a B13 deduction and a MAJOR finding routed to the Planner — not a FAIL. Blocking here would
punish the Generator for the Planner's imprecision; ignoring it would mean nobody ever fixes the
contract.

## 4. Dimension checks

### DIM-A — Architecture compliance (55%) — 11/11 applicable → 100

| Check | Result | Evidence |
|---|---|---|
| A1 | PASS | 14/14, including the assertion that no `routes.ts` imports a repository |
| A2 | PASS | 0 errors |
| A3 | PASS | No cross-module repository import in `routes.ts` |
| A4 | n/a | No cross-module read introduced |
| A5 | PASS | No sibling service import. **`src/alerts/**` is completely unmodified** and still reacted correctly |
| A6 | PASS | No new event names; no emit added this sprint (they come from sprint 1's service) |
| A7 | PASS | `routes.ts:38` throws `ValidationError` for a non-array `ids`; everything else reaches `errorHandler` |
| A8 | PASS | `{ field: 'ids' }` present; per-element failures use `ids[<n>]` |
| A9 | PASS | Route does shape validation and status selection only. Enum validation stays in the service via `isBulkStatusTarget` — no business rule in the route |
| A10 | n/a | `reports` untouched |
| A11 | PASS | `git diff --name-only 614c5c2..e663aae` over all gate files → empty |
| A12 | PASS | `package.json` unchanged |
| A13 | PASS | Uses `asObject`/`optionalString` per `api-integration`; ordering hazard documented in a comment at the route |

### DIM-B — Contract fulfilment and test substance (45%) — 12/13 applicable → 92

| Check | Result | Evidence |
|---|---|---|
| B1 | PASS | 0 errors |
| B2 | PASS | 232 passed; `routes.ts` above its 70% threshold |
| B3 | PASS | No AC `UNMET`/`NOT_ASSESSED`; AC-2.6's uncovered portion is not the business rule |
| B4 | PASS | All 6 named tests found and passing |
| B5 | PASS | AC-2.4 re-reads the activity after the 401 |
| B6 | PASS | AC-2.6 asserts the alert delta positively; sprint 1 holds the negative case |
| B7 | PASS | No route test asserts a status code alone — every one also asserts a body or a side effect |
| B8 | PASS | The new `ValidationError` branch is covered by AC-2.3 |
| B9 | PASS | Exactly the 2 files in the contract's table |
| B10 | PASS | No service/repository/types change — the sprint-1 boundary held |
| B11 | PASS | `GATES:` line matches |
| B12 | PASS | Manual curl gate performed; output recorded in the summary and reproduced by the Evaluator |
| B13 | **FAIL** | AC-2.6 is `PARTIAL` — see F-1 |

## 5. Findings

### F-1 — [MAJOR] AC-2.6 names a field that does not hold the value
**File:** `.harness/output/sprint-2-contract.md` (AC-2.6) → asserted at
`tests/activities/routes.test.ts:287`
**Check:** DIM-B/B13 FAIL
**Observed:** The AC requires "a **body** naming `act_restock_aisle4`". In the `Notification`
domain type, `body` and `title` are distinct fields; the `alerts` subscriber composes
`title: "SLA breach on activity <id>"` and `body: "Activity moved to BLOCKED (priority HIGH)."`.
The Generator's first test asserted `breach.body` literally and failed (231/232).
**Required:** An AC that names a field must name the field that actually holds the value.
**Fix:** **Planner action, not Generator.** Amend AC-2.6 to read "a `title` naming
`act_restock_aisle4`". The Generator's resolution — assert `title` for the id and `body` for the
reason, leaving out-of-scope `src/alerts/**` untouched — was the correct call and is explicitly
declared in its *Deviations*. Do **not** change `alerts` to satisfy the original wording: the
single-update path depends on the current composition.

### F-2 — [MINOR] Two different paths reach the same 400
**File:** `src/activities/routes.ts:44`
**Check:** none failed
**Observed:** `optionalString(id, …) ?? ''` maps a non-string element to `''`, which the service
then filters during de-duplication. So `{"ids":["act_x", 42]}` reports `field: "ids[1]"` (correct)
while `{"ids":[null]}` becomes an empty list and reports `field: "ids"`. Both are accurate 400s,
but they arrive by different routes.
**Required:** Nothing — no AC or rule is breached. Declared by the Generator.
**Fix:** Optional: one explicit branch for a null element.

### F-3 — [NOTE] All four outcome types never occur in one route-level request
**Observed:** Each outcome is covered individually; `forbidden` and `unchanged` are covered at the
service layer. The route does no per-item logic, so risk is low. The Evaluator's own curl run did
produce three of four (`updated`/`not_found`/`unchanged`) in a single response.

No BLOCKER findings.

## 6. Known-gap adjudication

| Generator-declared gap | Evaluator position | Effect on verdict |
|---|---|---|
| Null-element vs non-string-element both reach 400 differently | **Accepted** — both are correct 400s. Recorded as F-2 | None |
| No single request mixing all four outcomes | **Accepted** — route has no per-item logic. F-3 | None |
| 50-item cap still untested (carried from sprint 1) | **Accepted**, and now a *repeated* gap across two sprints — escalated to the Monitor as a skill-file signal | None on verdict; trend note required |
| Jest worker-teardown warning | **Accepted** — pre-existing at baseline, exits 0, `--detectOpenHandles` clean per suite. Not introduced here | None |
| AC-2.6 field substitution (declared as a Deviation) | **Upheld as correct**, but the contract defect is still recorded as F-1/MAJOR so the Planner fixes it | B13 FAIL |

## 7. Strengths (NOTEs for the Monitor's trend line)

- **`src/alerts/**` was not modified and still produced the right alert for a brand-new endpoint.**
  This is the single best piece of evidence in the run that failure mode 4 is closed: the
  event-bus seam meant a new caller inherited alerting for free.
- **The Generator declared the AC conflict rather than quietly rewriting the alert module.**
  Out-of-scope discipline held under pressure to make a test pass.
- **Route ordering hazard was anticipated and commented**, and AC-2.5 exists specifically as its
  regression guard — the contract predicted the most likely implementation mistake.
- **AC-2.3 asserts `details.field` per case** rather than just 400, which is the difference
  between testing the contract and testing the status line.

## 8. Verdict

```
--- VERDICT BLOCK (generated by .harness/bin/verdict.mjs) ---
SPRINT: 2 of 2
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
| B | Contract fulfilment and test substance | 45% | 12/13 | 92 |

WEIGHTED TOTAL: 96
BLOCKER FINDINGS: 0
DECISION RULE: all hard gates passed and weighted total 96 >= 85

VERDICT: PASS
--- END VERDICT BLOCK ---
```

Check results: `.harness/output/sprint-2-checks.json`

---
VERDICT: PASS
SPRINT: 2 of 2
ITERATION: 1
NEXT: ADVANCE
