# Evaluator Feedback — Sprint 1, Iteration 1

**Run:** LIVE run 2 — evaluated in loop position, immediately after the Generator
**Contract:** sprint-1-contract.md
**Generator summary:** generator-summary.md (iteration 1)
**Reviewed diff:** sprint-1 code `29111ec..614c5c2 -- src tests` as it stands at HEAD `1fa9afb`, plus working tree (`git diff -- src tests`: `tests/activities/service.test.ts` +6). A11 checked across `29111ec..HEAD` + working tree.
**Evaluated:** 2026-09-30
**Independence:** `.harness/reviews/` not read.

## 1. Gate re-run (independent)
| Gate | Command | Evaluator result | Generator claimed | Match |
|---|---|---|---|---|
| Type check | `npx tsc --noEmit` | PASS — exit 0, 0 errors | PASS | ✅ |
| Lint | `npx eslint .` | PASS — exit 0, 0 errors | PASS | ✅ |
| Tests + coverage | `npx jest --coverage` | PASS — 232/232, 12 suites; overall 97.03/90.3/95.85/97.02; `activities/service.ts` 97.05 stmts / 92.1 br / 100 fn / 97.02 lines; all thresholds met | PASS (same figures) | ✅ |
| Architecture | `npx jest tests/shared/architecture.test.ts` | PASS — 14/14 | PASS | ✅ |

## 2. Hard gates
All 7 PASS in §3 order — see the VERDICT BLOCK (§8), which is authoritative. HG-A4: `git diff --name-only 29111ec..HEAD` and the working tree show no change to `tests/shared/architecture.test.ts`, `.eslintrc.cjs`, `jest.config.ts`, `tsconfig*.json`, or `package.json`.

## 3. Acceptance criteria verification
| AC | Result | Verified by (test found?) | Evidence / gap |
|---|---|---|---|
| AC-1.1 | MET | "updates every activity in the batch" ✅ | `requested`/`updated` = 2; `results` `toEqual` both items updated/null/DONE; both read back DONE via `getTask` (service.test.ts:309-327) |
| AC-1.2 | MET | "reports per-item outcomes without failing the whole batch" ✅ | Caller `usr_lead`/DEPARTMENT_LEAD; both items asserted in full; `updated: 1`; awaited call resolves (:330-355) |
| AC-1.3 | MET | "refuses activities from another store without touching them" ✅ | store_002 activity arranged in-test via `createTask` on `prg_backroom_refit`; forbidden/FORBIDDEN/null; read-back TODO; aisle4 updated; `updated: 1` (:358-388) |
| AC-1.4 | MET | "reports unchanged and emits nothing when already in the target status" ✅ | unchanged/null/DONE; `updated: 0`; `status_changed` handler `not.toHaveBeenCalled()` (:391-405) |
| AC-1.5 | MET | "emits one status_changed event per changed activity" ✅ | 2 calls for 2 updatable + 1 unknown; each payload `taskId`, `previousStatus`, `status: DONE`, `actorId: usr_manager` (:408-430) |
| AC-1.6 | MET | "raises an SLA breach for each activity moved to BLOCKED" ✅ | called once, `taskId`/`priority: HIGH`; sorted key-set equals the `updateTask` payload key-set (:433-454) |
| AC-1.7 | MET | "throws ValidationError for request-level problems" ✅ | (a)-(d) `toBeInstanceOf(ValidationError)`; `field` ids for (a)(d), status for (b)(c) — (c) added this iteration; aisle4 still TODO, `count()` 3 (:457-503) |
| AC-1.8 | MET | "deduplicates repeated ids" ✅ | `requested: 1`, length 1, `updated: 1`, one event (:506-519) |

## 4. Dimension checks
### DIM-A — Architecture compliance
| Check | Result | Evidence |
|---|---|---|
| A1 | PASS | architecture test 14/14, exit 0 |
| A2 | PASS | eslint exit 0 |
| A3 | PASS | no `../<module>/repository` import added; service imports only `./repository` |
| A4 | n/a | no cross-module read in the diff — store scope compares `caller.storeId` to the activity's own `storeId` (spec §5 R1) |
| A5 | PASS | effects are `this.bus.emit(...)` only; grep: no `alertService`/`reportService`/`staffService` in `src/activities/` |
| A6 | PASS | `task.status_changed`, `task.sla_breached` declared at events.types.ts:18,26; no new names, no new subscribers |
| A7 | PASS | only throws are `ValidationError` (request-level); per-item codes NOT_FOUND / FORBIDDEN match the single-item path's subclasses |
| A8 | PASS | all three new `ValidationError`s carry `{ field }` (service.ts:182-203) |
| A9 | PASS | `findByIds` is a pure lookup; service has no `req`/`res`; no route in this sprint |
| A10 | n/a | `reports` untouched |
| A11 | PASS | no gate file changed in `29111ec..HEAD` or working tree |
| A12 | PASS | `package.json` unchanged |
| A13 | PASS | `BULK_STATUS_TARGETS` + `isBulkStatusTarget` enum+guard; explicit `public`; update via existing immutable `repository.update`; no inline role checks |

### DIM-B — Contract fulfilment and test substance
| Check | Result | Evidence |
|---|---|---|
| B1 | PASS | tsc exit 0 |
| B2 | PASS | 232/232; every threshold met |
| B3 | PASS | all 8 ACs MET |
| B4 | PASS | all 8 named tests exist under contract names and passed |
| B5 | PASS | AC-1.3 reads foreign activity back; AC-1.7 reads back + `count()` |
| B6 | FAIL | `task.status_changed`: positive (AC-1.5) + negative (AC-1.4). New `task.sla_breached` emission site: positive (AC-1.6), no negative — F-1 |
| B7 | n/a | no route tests in sprint 1 |
| B8 | PASS | every new throw (status, empty ids, >50 ids) tested with `ValidationError` |
| B9 | PASS | `614c5c2` touches exactly the 4 contract files; working tree touches only `tests/activities/service.test.ts` |
| B10 | PASS | see §6 — sprint-2 route at HEAD came from `e663aae` (separate sprint-2 commit); neither `614c5c2` nor the working tree touches `routes.ts` |
| B11 | PASS | `GATES:` line matches my re-run on all four |
| B12 | n/a | contract gate list has no manual verification for sprint 1 |
| B13 | PASS | no AC PARTIAL |

## 5. Findings
### F-1 — [MINOR] R6 test substance — no negative assertion for the bulk `task.sla_breached` emission
**File:** tests/activities/service.test.ts:391-430 (code: src/activities/service.ts:248)
**Check:** DIM-B/B6
**Observed:** The bulk path conditionally emits `task.sla_breached` (`BREACH_STATUSES.has(next.status)`). No test asserts it is **not** emitted for a DONE transition or an `unchanged` item; AC-1.4/AC-1.5 subscribe only to `task.status_changed`.
**Required:** Each new emission has a positive and a negative assertion (R6).
**Fix:** In the AC-1.4 or AC-1.5 test, also subscribe a `task.sla_breached` handler and assert `not.toHaveBeenCalled()`. Not required by any AC, hence MINOR.

Interpretation (stated for reproducibility): B6 is applied to new **emission sites**, not only new event names. Under the narrower reading B6 is `n/a`; the verdict is PASS either way.

## 6. Known-gap adjudication
| Generator-declared gap | Evaluator position | Effect on verdict |
|---|---|---|
| Sprint-2 route already present at HEAD (`e663aae`) | Accepted. Spec §7 item 5 declares the pre-existing implementation. B10 asks whether *this sprint* implemented later-sprint work: `614c5c2` and the working tree touch no sprint-2 file; the route arrived in a separate commit attributed to sprint 2. Failing B10 would penalise the declared situation, not the sprint | None — B10 PASS |
| Near-empty diff does not reflect true generation cost | Accepted; a Monitor concern, not an Evaluator check | None |
| Status guard runs before ids checks (bad status + empty ids → `field: "status"`) | Accepted. Contract tests each AC-1.7 case in isolation and does not specify precedence; either field is a correct `ValidationError` | None |

## 7. Strengths (NOTEs for the Monitor's trend line)
- R2 working as designed: bulk path emits the same two catalogue events as `updateTask`; `alerts` not modified.
- AC-1.3 arranges its store_002 fixture in-test, honouring the FV-1 correction and leaving seeds intact.
- AC-1.6 compares the bulk payload key-set to the single-update path rather than restating it.
- This iteration's only change closed a real assertion gap (AC-1.7 case (c) `field`) — the Generator verified rather than trusted existing code.
- Generator `GATES:` line and coverage figures matched the independent re-run exactly.

## 8. Verdict

Determinism check — `verdict.mjs` run three times on the same `sprint-1-checks.json`, outputs diffed (empty):
- run 1 SHA-256 `39f5b1af30ccdd383a237204ebfd1e54b7349a193143f059143bc50ce7cdbfa5`
- run 2 SHA-256 `39f5b1af30ccdd383a237204ebfd1e54b7349a193143f059143bc50ce7cdbfa5`
- run 3 SHA-256 `39f5b1af30ccdd383a237204ebfd1e54b7349a193143f059143bc50ce7cdbfa5`

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
| B | Contract fulfilment and test substance | 45% | 10/11 | 91 |

WEIGHTED TOTAL: 96
BLOCKER FINDINGS: 0
DECISION RULE: all hard gates passed and weighted total 96 >= 85

VERDICT: PASS
--- END VERDICT BLOCK ---
```

---
VERDICT: PASS
SPRINT: 1 of 2
ITERATION: 1
NEXT: ADVANCE
