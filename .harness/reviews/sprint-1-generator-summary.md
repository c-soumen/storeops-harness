# Generator Summary — Sprint 1, Iteration 1

**Contract:** sprint-1-contract.md
**Spec:** spec.md §5 sprint 1
**Feature:** Shift handover bulk status update

## Acceptance criteria self-check

| AC | Summary | Status | Verified by | Note |
|---|---|---|---|---|
| AC-1.1 | Happy path, all ids updatable | ✅ | `tests/activities/service.test.ts` — "updates every activity in the batch" | Asserts `requested`/`updated` counts, exact `results` array, and both activities read back as DONE |
| AC-1.2 | Partial failure: unknown id reported, batch continues | ✅ | — "reports per-item outcomes without failing the whole batch" | Called as DEPARTMENT_LEAD per the AC; no exception propagates |
| AC-1.3 | Cross-store activity refused per item, state unchanged | ✅ | — "refuses activities from another store without touching them" | `store_002` activity arranged in-test via `createTask` as a `store_002` caller, per the contract's arrangement note. Seeds untouched |
| AC-1.4 | Idempotency: already in target status | ✅ | — "reports unchanged and emits nothing when already in the target status" | `updated: 0`, outcome `unchanged`, zero `task.status_changed` emissions |
| AC-1.5 | One audit event per changed activity | ✅ | — "emits one status_changed event per changed activity" | Exactly 2 emissions for 2 changed + 1 unknown; both payloads assert `previousStatus` and `actorId` |
| AC-1.6 | BLOCKED raises an SLA breach, matching single-update behaviour | ✅ | — "raises an SLA breach for each activity moved to BLOCKED" | Payload key-set compared against the `updateTask` emission for the same transition, so the two paths cannot drift |
| AC-1.7 | Request-level validation throws | ✅ | — "throws ValidationError for request-level problems" | All four cases (empty ids, `TODO`, `PAUSED`, 51 ids); asserts `details.field` and that nothing was modified |
| AC-1.8 | Duplicate ids deduplicated | ✅ | — "deduplicates repeated ids" | `requested: 1`, one result, one event |

Legend: ✅ met · ⚠️ partially met (explain) · ❌ not met (explain)

## Files changed

| Path | Layer | Change | Lines |
|---|---|---|---|
| `src/activities/types.ts` | types | `BULK_STATUS_TARGETS`, `BulkStatusTarget`, `BulkStatusOutcome`, `BulkStatusInput`, `BulkStatusResultItem`, `BulkStatusResult`, `isBulkStatusTarget` | +34 |
| `src/activities/repository.ts` | repository | `findByIds(ids)` — single lookup pass, unknown ids absent | +12 |
| `src/activities/service.ts` | service | `bulkUpdateStatus`, `BULK_MAX_ITEMS = 50`, import updates | +111 / −2 |
| `tests/activities/service.test.ts` | test | AC-1.1 … AC-1.8 | +209 |

Four files, all inside the contract's expected-changes table. Nothing outside it.

## Gate results

| Gate | Command | Result |
|---|---|---|
| Type check | `npx tsc --noEmit` | PASS — 0 errors |
| Lint | `npx eslint .` | PASS — 0 errors |
| Tests | `npx jest --coverage` | PASS — 227 tests, 12 suites; 97.00% statements, 90.51% branches, 95.81% functions, 96.99% lines; all thresholds met |
| Architecture | `npx jest tests/shared/architecture.test.ts` | PASS — ran inside the full suite (R1, R3, R4, R5) |

## Architecture rule compliance

| Rule | How this sprint satisfies it |
|---|---|
| R1 Module boundary | No cross-module access at all. Store scoping compares `caller.storeId` with the activity's own `storeId`; no `programmes`/`staff` repository or service read was needed |
| R2 Event bus only | Audit entries are `bus.emit('task.status_changed', …)` per changed activity and `bus.emit('task.sla_breached', …)` per BLOCKED transition. `activities` imports neither `alerts` nor `reports`. No new event names — both already exist in `events.types.ts` |
| R3 Error contract | Request-level failures throw `ValidationError` with `{ field }`. Per-item failures are classified, not thrown, and carry the same `code` strings (`NOT_FOUND`, `FORBIDDEN`) the error handler would emit — so the batch body stays consistent with single-item error bodies |
| R4 Layer separation | Repository only looks up (`findByIds`); service owns validation, authorization, classification, and emission; no route touched this sprint |
| R5 Read-only reports | n/a — `reports` untouched |
| R6 Test substance | Every negative-path AC asserts state as well as outcome: AC-1.3 reads the foreign activity back as `TODO`, AC-1.7 re-reads the activity and `repository.count()`, AC-1.4 asserts zero emissions |

## Deviations from the contract

None. Type names, shapes, and the `BULK_MAX_ITEMS` value are exactly as specified, because
sprint 2's route depends on them.

## Known gaps

1. **The 50-item boundary itself is untested.** AC-1.7 tests 51 (rejected); a 50-id batch is not
   exercised. Adding it would need 50 real seeded activities, which conflicts with the "do not
   extend seeds" rule. Flagging rather than fixing — the Evaluator should decide whether an
   off-by-one at the cap is a risk worth a synthetic fixture.
2. **`findByIds` is O(n) over the input**, which is correct for an in-memory `Map`, but the method
   is now public API on the repository and a future SQL implementation would want a single `IN`
   query. No action this sprint.
3. **Ordering of `results` follows the de-duplicated input order.** The contract does not specify
   ordering; tests for AC-1.1 assert exact array order and would need loosening if the
   implementation ever parallelises. Noted so the assumption is visible.
4. **Out of scope and untouched, as instructed:** `src/activities/routes.ts` (sprint 2),
   `src/app.ts`, `shared/events/events.types.ts`, all other modules.

---
GENERATOR: COMPLETE
SPRINT: 1 of 2
ITERATION: 1
GATES: tsc=PASS eslint=PASS jest=PASS architecture=PASS
