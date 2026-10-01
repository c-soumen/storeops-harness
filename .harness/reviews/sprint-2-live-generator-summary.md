# Generator Summary — Sprint 2, Iteration 1

**LIVE run 2, loop position: after sprint 1 PASS, before Evaluator**
**Contract:** sprint-2-contract.md
**Spec:** spec.md §6 sprint 2 (APPROVED 2026-10-01T02:56Z)
**Mode:** verify existing implementation (`e663aae`) against the corrected contract (spec §7 item 5)

## Acceptance criteria self-check
| AC | Summary | Status | Verified by | Note |
|---|---|---|---|---|
| AC-2.1 | 207, mixed outcomes | ✅ | tests/activities/routes.test.ts "returns 207 with per-item outcomes" | Asserts 207, `updated` 1, the full `updated` item for `act_restock_aisle4`, and `not_found` + `NOT_FOUND` for `act_missing` |
| AC-2.2 | 207 when every item fails | ✅ | — "returns 207 when no item could be updated" | 207, `updated` 0, `results[0].outcome` `not_found` |
| AC-2.3 | Request-level 400 | ✅ | — "returns 400 for request-level problems" | **Changed this iteration:** (b) and (c) did not assert `error.code`. Added `VALIDATION_ERROR` checks so all three cases assert status, code and `details.field` (`ids`/`status`/`ids`) |
| AC-2.4 | 401 without token | ✅ | — "returns 401 without a token" | 401, `UNAUTHORIZED`, and `act_restock_aisle4` still `TODO` afterwards |
| AC-2.5 | Route ordering; single PATCH 200 | ✅ | — pre-existing "returns 200 with the updated activity" | Passes. `/bulk-status` is registered at routes.ts:88, before `PATCH /:id` at :108. The test also sends `priority`, which is a superset of the AC body |
| AC-2.6 | Bulk BLOCKED gives SLA alert | ✅ | — "raises an SLA alert for the assignee via the bulk endpoint" | Alert count is before+1, `type` `SLA_BREACH`, **`title`** contains `act_restock_aisle4`, `body` contains `BLOCKED`. Matches the FV-1 correction |

Legend: ✅ met · ⚠️ partially met (explain) · ❌ not met (explain)

## Files changed
| Path | Layer | Change | Lines |
|---|---|---|---|
| `tests/activities/routes.test.ts` | test | AC-2.3: added `error.code === 'VALIDATION_ERROR'` assertions for cases (b) and (c) | +2 |
| `src/activities/routes.ts` | routes | None. The existing route already satisfies AC-2.1..2.6 | 0 |

## Gate results
| Gate | Command | Result |
|---|---|---|
| Type check | `npx tsc --noEmit` | PASS, 0 errors |
| Lint | `npx eslint .` | PASS, 0 errors |
| Tests | `npx jest --coverage` | PASS. 232 tests, 12 suites. Lines 97.0% overall, branches 90.3%. `activities/routes.ts` 100% lines, `activities/service.ts` 97.0% lines. Thresholds met |
| Architecture | `npx jest tests/shared/architecture.test.ts` | PASS, 14/14 |
| Build | `npm run build` | PASS, 0 errors |

## Curl verification
`node dist/server.js` on :3000. The port was free before the run, the server was stopped afterwards, and :3000 was confirmed free (no listener, curl exit 7).

| Check | Request | Actual |
|---|---|---|
| Contract curl | PATCH bulk-status `{ids:[act_restock_aisle4,act_missing],status:DONE}` as manager | `HTTP/1.1 207 Multi-Status`. `{"requested":2,"updated":1,"results":[{"id":"act_restock_aisle4","outcome":"updated","code":null,"status":"DONE"},{"id":"act_missing","outcome":"not_found","code":"NOT_FOUND","status":null}]}` |
| Single-item PATCH | PATCH `/act_restock_aisle4` `{status:IN_PROGRESS}` | `HTTP/1.1 200 OK`, `"status":"IN_PROGRESS"` |
| Missing ids | PATCH bulk-status `{status:DONE}` | `HTTP/1.1 400`. `{"error":{"code":"VALIDATION_ERROR","message":"ids must be an array of activity ids","details":{"field":"ids"}}}` |
| No token | PATCH bulk-status, valid body, no header | `HTTP/1.1 401`, `code: "UNAUTHORIZED"` |
| Bulk BLOCKED alert | associate alerts before, then bulk `{ids:[act_restock_aisle4],status:BLOCKED}`, then alerts after | Before: 1 (INVENTORY). Bulk: `207`, `updated:1`, `status:BLOCKED`. After: 2, new `{"type":"SLA_BREACH","channel":"IN_APP","title":"SLA breach on activity act_restock_aisle4","body":"Activity moved to BLOCKED (priority HIGH)."}` |

## Architecture rule compliance
| Rule | How this sprint satisfies it |
|---|---|
| R1 Module boundary | The route imports only `./service`, `./types`, `shared/errors`, `staff/auth.middleware`. No repository imports (the architecture test passes) |
| R2 Event bus only | The alert comes from sprint 1's `task.sla_breached` emit through the unmodified `alerts` subscriber. `src/alerts/**` was not touched |
| R3 Error contract | Route shape errors throw `ValidationError` with `{ field }`. No raw `Error`. Lint passes |
| R4 Layer separation | The route only shapes `ids`/`status`, picks 207 and serialises `BulkStatusResult` unchanged. Domain validation (`isBulkStatusTarget`, empty/cap) stays in the service |
| R5 Read-only reports | n/a. Reports were not touched |
| R6 Test substance | Every route test asserts body as well as status. AC-2.4 asserts state is unchanged. AC-2.6 asserts the observable side effect (assignee alert, `title` + `body`) |

## Deviations from the contract
- None. The only change is inside `tests/activities/routes.test.ts`, which is listed in the contract.

## Known gaps
- AC-2.5's test sends `{status, priority}` rather than the AC's `{status}` alone. This is a strict superset and the curl check exercised the exact AC body (200). I left the test unchanged because the contract says "pre-existing … must still pass".
- AC-2.3 does not cover the batch cap (51 ids) at the route level. That is covered by sprint 1 service tests and is not a sprint-2 AC.

---
GENERATOR: COMPLETE
SPRINT: 2 of 2
ITERATION: 1
GATES: tsc=PASS eslint=PASS jest=PASS architecture=PASS
