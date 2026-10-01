# Generator Summary — Sprint 1, Iteration 1

**Contract:** sprint-1-contract.md (corrected — FV-1 / correction #11 applied by Planner)
**Spec:** spec.md §6 sprint 1 (APPROVED 2026-10-01T02:56Z)
**Run:** LIVE run 2 — loop position: after approved spec, before Evaluator
**Mode:** verification of pre-existing code (spec §7 item 5). The feature was implemented by the
retrospective run (`614c5c2` sprint 1, `e663aae` sprint 2); HEAD at start `1fa9afb`. This
invocation checked that code against the corrected contract and changed only what it required.

## Acceptance criteria self-check
| AC | Summary | Status | Verified by | Note |
|---|---|---|---|---|
| AC-1.1 | Happy path, all ids updatable | ✅ | tests/activities/service.test.ts "updates every activity in the batch" | `requested`/`updated` = 2, exact `results` via `toEqual`, both read back `DONE` via `getTask` |
| AC-1.2 | Unknown id reported, batch continues | ✅ | … "reports per-item outcomes without failing the whole batch" | Caller is `usr_lead`/DEPARTMENT_LEAD; both items asserted in full; `updated: 1`; call resolves (no throw) |
| AC-1.3 | Cross-store refused per item, state unchanged | ✅ | … "refuses activities from another store without touching them" | store_002 activity arranged in-test via `createTask` on `prg_backroom_refit`; seeds untouched; `getTask` still `TODO` |
| AC-1.4 | Idempotent `unchanged`, no event | ✅ | … "reports unchanged and emits nothing when already in the target status" | `updated: 0`; `status_changed` handler `not.toHaveBeenCalled()` |
| AC-1.5 | One `status_changed` per changed activity | ✅ | … "emits one status_changed event per changed activity" | 2 updatable + 1 unknown → exactly 2 calls; each asserts `taskId`, `previousStatus`, `status: DONE`, `actorId: usr_manager` |
| AC-1.6 | BLOCKED raises SLA breach, same key-set as single update | ✅ | … "raises an SLA breach for each activity moved to BLOCKED" | Called once, `taskId`/`priority: HIGH`; sorted key-set compared with `updateTask`'s payload |
| AC-1.7 | Request-level `ValidationError` | ✅ | … "throws ValidationError for request-level problems" | **Changed this run:** added `details.field === "status"` for case (c) `PAUSED` — previously only (b) `TODO` asserted it. (a)–(d) class, (a)(d) `ids`, (b)(c) `status`, state unchanged |
| AC-1.8 | Duplicate ids deduplicated | ✅ | … "deduplicates repeated ids" | `requested: 1`, results length 1, `updated: 1`, one event |

Legend: ✅ met · ⚠️ partially met (explain) · ❌ not met (explain)

Pinned shapes checked against `src/activities/types.ts`: `BULK_STATUS_TARGETS`, `BulkStatusTarget`,
`BulkStatusOutcome`, `BulkStatusInput`, `BulkStatusResultItem`, `BulkStatusResult`,
`isBulkStatusTarget` — names and fields match the contract exactly. `findByIds(ids: readonly ID[]): Task[]`
present in `repository.ts`; `BULK_MAX_ITEMS = 50` in `service.ts`; status guard is
`isBulkStatusTarget`, not `isTaskStatus`.

## Files changed
| Path | Layer | Change | Lines |
|---|---|---|---|
| `tests/activities/service.test.ts` | test | AC-1.7: one added assertion (PAUSED → `details.field: "status"`) | +6 |

`src/` diff is **empty**. Total diff: 1 file, +6 / −0. No other file touched.

## Gate results (last run, after the change)
| Gate | Command | Result |
|---|---|---|
| Type check | `npx tsc --noEmit` | PASS — 0 errors |
| Lint | `npx eslint .` | PASS — 0 errors |
| Tests | `npx jest --coverage` | PASS — 232 tests / 12 suites; overall 97.03% stmts, 90.3% branches, 95.85% funcs, 97.02% lines; `activities/service.ts` 97.03% lines (70/76 branches), `activities/routes.ts` 100% lines, `activities/repository.ts` 97.22% |
| Architecture | `npx jest tests/shared/architecture.test.ts` | PASS — 14/14 |

## Architecture rule compliance
| Rule | How this sprint satisfies it |
|---|---|
| R1 Module boundary | Store scope compares `caller.storeId` with the activity's own `storeId`; no cross-module repository import (architecture test green) |
| R2 Event bus only | `bus.emit('task.status_changed')` per changed item, `bus.emit('task.sla_breached')` per BLOCKED; no alerts/reports import; no new event names |
| R3 Error contract | Request-level → `ValidationError` with `{ field }`; per-item failures classified with `NOT_FOUND`/`FORBIDDEN` codes, not thrown; no raw `Error` |
| R4 Layer separation | Repository only looks up (`findByIds`, `update`); service owns validation, auth, classification, emission |
| R5 Read-only reports | n/a — reports untouched |
| R6 Test substance | Every outcome class asserts the full result item plus state (read-back or event count); negative paths assert no mutation / no emit |

## Deviations from the contract
- None in scope. The only edit is inside the contract's file table (`tests/activities/service.test.ts`).

## Known gaps
- **Sprint 2 code already present at HEAD.** `src/activities/routes.ts` already registers
  `PATCH /bulk-status` (before `PATCH /:id`) and route tests exist, from retrospective commit
  `e663aae`. This invocation did **not** implement or modify it; it is outside this contract.
  Evaluator to adjudicate B10 (later-sprint work present) on that basis.
- Diff is near-empty because the feature pre-exists (spec §7 item 5); it does not reflect the
  feature's true generation cost.
- Minor, not required by the contract: in `bulkUpdateStatus` the status guard runs before the ids
  checks, so a request with both bad `status` and empty `ids` reports `field: "status"`. Each AC-1.7
  case is tested in isolation, so the contract is satisfied.

---
GENERATOR: COMPLETE
SPRINT: 1 of 2
ITERATION: 1
GATES: tsc=PASS eslint=PASS jest=PASS architecture=PASS
