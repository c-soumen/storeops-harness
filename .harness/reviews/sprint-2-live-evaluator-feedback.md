# Evaluator Feedback — Sprint 2, Iteration 1

**Run:** LIVE run 2 — evaluated in loop position, immediately after the Generator
**Contract:** sprint-2-contract.md
**Generator summary:** generator-summary.md (iteration 1)
**Reviewed diff:** `614c5c2..e663aae -- src tests` (route, retrospective commit) + working tree (`tests/activities/routes.test.ts`, +2 lines, this Generator run). A11 checked across `614c5c2..HEAD` + working tree; B10 across `e663aae..HEAD -- src` + working tree.
**Evaluated:** 2026-10-01

## 1. Gate re-run (independent)
| Gate | Command | Evaluator result | Generator claimed | Match |
|---|---|---|---|---|
| Type check | `npx tsc --noEmit` | exit 0, 0 errors | PASS | ✅ |
| Lint | `npx eslint .` | exit 0, 0 errors | PASS | ✅ |
| Tests + coverage | `npx jest --coverage` | exit 0; 232/232 tests, 12 suites; lines 97.02%, branches 90.3%; `activities/routes.ts` 100% stmts / 92% branches; `activities/service.ts` 97.05%; all thresholds met | PASS (232, 97.0%) | ✅ |
| Architecture | `npx jest tests/shared/architecture.test.ts` | exit 0, 14/14 | PASS 14/14 | ✅ |
| Build (B12 prerequisite) | `npm run build` | exit 0 | PASS | ✅ |

## 2. Hard gates
All 7 PASS in §3 order (HG-A4 → HG-B3). The VERDICT BLOCK in §8 is authoritative.
HG-A4 evidence: `git diff --name-only 614c5c2..HEAD` + working tree touches none of
`tests/shared/architecture.test.ts`, `.eslintrc.cjs`, `jest.config.ts`, `tsconfig*.json`.

## 3. Acceptance criteria verification
| AC | Result | Verified by (test found?) | Evidence / gap |
|---|---|---|---|
| AC-2.1 | MET | ✅ "returns 207 with per-item outcomes" (routes.test.ts:197) | 207; `updated` 1; `toContainEqual` updated item for `act_restock_aisle4` and `not_found`/`NOT_FOUND` for `act_missing` |
| AC-2.2 | MET | ✅ "returns 207 when no item could be updated" (:221) | 207; `updated` 0; `results[0].outcome` `not_found` |
| AC-2.3 | MET | ✅ "returns 400 for request-level problems" (:233) | (a)(b)(c) each assert 400, `VALIDATION_ERROR`, and `details.field` `ids`/`status`/`ids`. The working-tree +2 lines closed the `error.code` gap for (b) and (c) |
| AC-2.4 | MET | ✅ "returns 401 without a token" (:260) | 401, `UNAUTHORIZED`, re-reads `act_restock_aisle4` → `TODO` |
| AC-2.5 | MET | ✅ pre-existing "returns 200 with the updated activity" (:144) | 200, `body.status` `IN_PROGRESS`. Route order verified: `/bulk-status` routes.ts:88 before `/:id` :108 |
| AC-2.6 | MET | ✅ "raises an SLA alert for the assignee via the bulk endpoint" (:275) | count before+1, `type` SLA_BREACH, `title` contains id, `body` contains `BLOCKED` (FV-1-corrected field) |

## 4. Dimension checks
### DIM-A — Architecture compliance
| Check | Result | Evidence |
|---|---|---|
| A1 | PASS | architecture.test.ts 14/14, exit 0 |
| A2 | PASS | eslint exit 0 |
| A3 | PASS | routes.ts imports `./service`, `./types`, `shared/errors`, `staff/auth.middleware` only |
| A4 | n/a | Diff adds no cross-module read |
| A5 | PASS | No `alertService`/`reportService`/`staffService` import in diff; alert arrives via sprint-1 `task.sla_breached` emit and the unmodified alerts subscriber |
| A6 | n/a | Diff uses no event name; `events.types.ts` and `src/app.ts` untouched |
| A7 | PASS | Only throw in diff: `ValidationError` for non-array `ids` (routes.ts:95) — correct subclass for malformed input |
| A8 | PASS | routes.ts:95 `{ field: 'ids' }`; per-id via `optionalString(id, 'ids[i]')` carries `{ field }` |
| A9 | PASS | Route does shape checks only (`asObject`, `Array.isArray`, string coercion) and picks 207; `isBulkStatusTarget`/empty/cap/store scoping remain in service |
| A10 | n/a | `reports` not in diff |
| A11 | PASS | Gate files unmodified (see §2) |
| A12 | PASS | `package.json` unchanged in `614c5c2..HEAD` and working tree |
| A13 | PASS | Matches existing route idiom (`asyncHandler`, `currentUser`, `asObject`, `optionalString`); no inline role checks |

### DIM-B — Contract fulfilment and test substance
| Check | Result | Evidence |
|---|---|---|
| B1 | PASS | tsc exit 0 |
| B2 | PASS | jest exit 0, thresholds met |
| B3 | PASS | All six ACs MET |
| B4 | PASS | All six named tests exist and passed in my run |
| B5 | FAIL | F-1 |
| B6 | n/a | Sprint 2 introduces no new event (emits are sprint 1's, asserted positive + negative in service tests) |
| B7 | PASS | Every new bulk-status test asserts body or side effect beyond status |
| B8 | PASS | New branch routes.ts:94-96 asserted by code `VALIDATION_ERROR` + `field: 'ids'` (:255-257) |
| B9 | PASS | Changed: `src/activities/routes.ts` (e663aae), `tests/activities/routes.test.ts` (e663aae + working tree) — both listed |
| B10 | PASS | `git diff --name-only e663aae..HEAD -- src` empty; working tree touches no `src`; `d70ca7a` touched only `tests/activities/service.test.ts`. No service/repository/types/alerts change; no GET on `/bulk-status` |
| B11 | PASS | `GATES: tsc=PASS eslint=PASS jest=PASS architecture=PASS` matches |
| B12 | PASS | Generator recorded curl output; Evaluator re-performed it (below), results match |
| B13 | PASS | No PARTIAL AC |

**Evaluator's own manual gate (B12).** :3000 free before; `npm run build` exit 0; `node dist/server.js`.
- Contract curl → `HTTP/1.1 207 Multi-Status`, `{"requested":2,"updated":1,"results":[{"id":"act_restock_aisle4","outcome":"updated","code":null,"status":"DONE"},{"id":"act_missing","outcome":"not_found","code":"NOT_FOUND","status":null}]}`
- AC-2.6 (after single PATCH back to IN_PROGRESS → `200 OK`): associate alerts before 1; bulk BLOCKED → `HTTP/1.1 207 Multi-Status`, `updated:1`; after 2, new `SLA_BREACH`, `title: "SLA breach on activity act_restock_aisle4"`, `body: "Activity moved to BLOCKED (priority HIGH)."`
- Missing ids → `HTTP/1.1 400 Bad Request`, `VALIDATION_ERROR`, `{field:"ids"}`; no token → `HTTP/1.1 401 Unauthorized`, `UNAUTHORIZED`
- Server stopped; :3000 no listener, curl exit 7.

**Readings applied (check wording admitting two readings):**
- **B5** "every negative-path test": applied the *strict* reading (every negative-path test in the diff, including request-level 400s). Lenient reading (only paths that could reach the repository) → PASS, B=100, total 100. PASS either way.
- **B7** scope: applied the *diff* reading (new tests only). Whole-file reading would FAIL on pre-existing status-only tests at routes.test.ts:164, :172 → B 10/12=83, total 92. PASS either way.
- **B6** "new event": applied the *new event name* reading → n/a. Under a "new emission path" reading scored FAIL at route level, and with B5, B6, B7 all adverse, B 9/13=69, total 86 → still PASS. **The verdict does not depend on any reading.**
- **AC-2.5** test body `{status, priority}` vs AC's `{status}`: THEN clauses fully asserted; WHEN superset accepted as MET (exact body exercised by curl).
- **A11**: applied the check's literal file list; `.harness/bin/verdict.mjs` and `grading-criteria` changes in range are their creation (67a9f17), not a weakening.

## 5. Findings
### F-1 — [MAJOR] R6 test substance — negative path does not assert state unchanged
**File:** tests/activities/routes.test.ts:242-248 (also :221-229)
**Check:** B5
**Observed:** AC-2.3 case (b) sends `act_restock_aisle4` with `status: 'TODO'` and asserts only the error; the activity is never re-read. AC-2.2's all-fail case asserts the body but not that the store's activities are unchanged.
**Required:** Negative-path tests assert state unchanged (R6), as AC-2.4 already does.
**Fix:** After case (b), `GET /api/activities/act_restock_aisle4` and assert `status` is `TODO`. No production change.

### F-2 — [NOTE] Pre-existing status-only route tests
**File:** tests/activities/routes.test.ts:164, :172
**Observed:** "returns 400 for an empty patch" / "returns 404 for an unknown activity" assert only status. Not in this sprint's diff; not scored. Backlog candidate.

## 6. Known-gap adjudication
| Generator-declared gap | Evaluator position | Effect on verdict |
|---|---|---|
| AC-2.5 test sends `{status, priority}` not `{status}` | Accepted: superset, both THEN clauses asserted, contract required the pre-existing test to pass unchanged; exact body verified by curl | None (AC-2.5 MET) |
| Batch cap (51 ids) not tested at route level | Accepted: not a sprint-2 AC; cap is a service rule covered by sprint-1 tests | None |

## 7. Strengths (NOTEs for the Monitor's trend line)
- R2 working: bulk BLOCKED produced the identical `SLA_BREACH` alert with `src/alerts/**` unmodified — failure mode 4 closed, verified at the observable effect in test and live curl.
- FV-1 correction held end-to-end: AC-2.6 asserts `title` (id) and `body` (reason), matching `alerts/service.ts`.
- Route-ordering risk explicitly guarded (comment at routes.ts:87) and verified by AC-2.5.
- Generator's GATES line and curl evidence matched the Evaluator's independent re-run; diff scoped to one listed test file.

## 8. Verdict

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
| A | Architecture compliance | 55% | 10/10 | 100 |
| B | Contract fulfilment and test substance | 45% | 11/12 | 92 |

WEIGHTED TOTAL: 96
BLOCKER FINDINGS: 0
DECISION RULE: all hard gates passed and weighted total 96 >= 85

VERDICT: PASS
--- END VERDICT BLOCK ---

Determinism: `verdict.mjs` run 3× to separate files (`s2-det-run{1,2,3}.txt`); all three sha256 =
`165f482b22265587e3f933918f5e8ebe785b4f64370d1c50845970e7e6fe781b`; `diff` empty.

---
VERDICT: PASS
SPRINT: 2 of 2
ITERATION: 1
NEXT: ADVANCE
