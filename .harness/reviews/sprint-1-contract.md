# Sprint 1 Contract: Bulk status update in the activities service

**Spec:** spec.md §6 sprint 1 (live run 2)
**Depends on:** none

## Objective

Add `ActivityService.bulkUpdateStatus(caller, input)`: takes activity ids and one target status
(`DONE` or `BLOCKED`), classifies every id into an outcome, applies the change only where
permitted, and emits the same events a single-activity update would. Request-level problems throw
`ValidationError`; per-item problems are reported, never thrown.

## Files expected to change

| Path | Layer | Change |
|---|---|---|
| `src/activities/types.ts` | types | `BULK_STATUS_TARGETS` + `isBulkStatusTarget`; `BulkStatusTarget`, `BulkStatusInput`, `BulkStatusOutcome`, `BulkStatusResultItem`, `BulkStatusResult` |
| `src/activities/repository.ts` | repository | `findByIds(ids: readonly ID[]): Task[]` |
| `src/activities/service.ts` | service | `bulkUpdateStatus`; `BULK_MAX_ITEMS = 50` |
| `tests/activities/service.test.ts` | test | AC-1.1 … AC-1.8 |

Shapes the Generator may not rename — sprint 2's route depends on them:

```ts
export const BULK_STATUS_TARGETS = ['DONE', 'BLOCKED'] as const;
export type BulkStatusTarget = (typeof BULK_STATUS_TARGETS)[number];
export type BulkStatusOutcome = 'updated' | 'unchanged' | 'not_found' | 'forbidden';

export interface BulkStatusInput { ids: ID[]; status: BulkStatusTarget }
export interface BulkStatusResultItem {
  id: ID; outcome: BulkStatusOutcome; code: string | null; status: TaskStatus | null;
}
export interface BulkStatusResult { requested: number; updated: number; results: BulkStatusResultItem[] }
```

## Acceptance criteria

### AC-1.1 — Happy path, all ids updatable
GIVEN an authenticated STORE_MANAGER (`token-manager`, `store_001`)
WHEN `bulkUpdateStatus` is called with `["act_restock_aisle4", "act_planogram_home"]` and status `DONE`
THEN `requested: 2`, `updated: 2`, AND both items have `outcome: "updated"`, `code: null`, `status: "DONE"`, AND both read back as `DONE` via `getTask`
**Verified by:** `tests/activities/service.test.ts` — "updates every activity in the batch"

### AC-1.2 — Partial failure: unknown id reported, batch continues
GIVEN an authenticated DEPARTMENT_LEAD (`token-lead`, `store_001`)
WHEN `bulkUpdateStatus` is called with `["act_restock_aisle4", "act_missing"]` and status `BLOCKED`
THEN `act_restock_aisle4` is `outcome: "updated"`, `status: "BLOCKED"`, AND `act_missing` is `outcome: "not_found"`, `code: "NOT_FOUND"`, `status: null`, AND `updated: 1`, AND no exception propagates
**Verified by:** — "reports per-item outcomes without failing the whole batch"

### AC-1.3 — Cross-store activity refused per item, state unchanged
GIVEN an authenticated STORE_MANAGER (`token-manager`, `store_001`)
AND a `store_002` activity **arranged inside the test** — per spec §4 there is no such fixture — by
   calling `createTask` as `{ id: 'usr_manager', storeId: 'store_002', role: 'STORE_MANAGER' }`
   against programme `prg_backroom_refit`, capturing the returned id
WHEN `bulkUpdateStatus` is called as the `store_001` caller with `["act_restock_aisle4", <that id>]` and status `DONE`
THEN the `store_002` item is `outcome: "forbidden"`, `code: "FORBIDDEN"`, `status: null`, AND `getTask` on it still shows `TODO`, AND `act_restock_aisle4` is `outcome: "updated"`, AND `updated: 1`
**Verified by:** — "refuses activities from another store without touching them"

Seeds must **not** be extended to close this: `tests/reports/service.test.ts` asserts
`activitiesByStore: { store_001: 3, store_002: 0 }`.

### AC-1.4 — Idempotency: already in target status
GIVEN an authenticated STORE_MANAGER (`token-manager`, `store_001`) and `act_chiller_temp_check` already `DONE`
WHEN `bulkUpdateStatus` is called with `["act_chiller_temp_check"]` and status `DONE`
THEN the item is `outcome: "unchanged"`, `code: null`, `status: "DONE"`, AND `updated: 0`, AND **no** `task.status_changed` event is emitted
**Verified by:** — "reports unchanged and emits nothing when already in the target status"

### AC-1.5 — One audit event per changed activity
GIVEN an authenticated STORE_MANAGER (`token-manager`, `store_001`) and a `task.status_changed` subscriber on the service's `EventBus`
WHEN `bulkUpdateStatus` is called with two updatable ids and one unknown id, status `DONE`
THEN the subscriber is called exactly twice, AND each payload carries the changed `taskId`, `previousStatus`, `status: "DONE"`, `actorId: "usr_manager"`
**Verified by:** — "emits one status_changed event per changed activity"

### AC-1.6 — BLOCKED raises an SLA breach, matching single-update behaviour
GIVEN an authenticated STORE_MANAGER (`token-manager`, `store_001`) and a `task.sla_breached` subscriber
WHEN `bulkUpdateStatus` is called with `["act_restock_aisle4"]` and status `BLOCKED`
THEN the subscriber is called once with `taskId: "act_restock_aisle4"`, `priority: "HIGH"`, AND the payload key-set is identical to the one `updateTask` emits for the same transition
**Verified by:** — "raises an SLA breach for each activity moved to BLOCKED"

### AC-1.7 — Request-level validation throws
GIVEN an authenticated STORE_MANAGER (`token-manager`, `store_001`)
WHEN `bulkUpdateStatus` is called with (a) `ids: []`, (b) `status: "TODO"`, (c) `status: "PAUSED"`, or (d) 51 ids
THEN each rejects with `ValidationError`, AND `details.field` is `"ids"` for (a) and (d) and `"status"` for (b) and (c), AND no activity is modified
**Verified by:** — "throws ValidationError for request-level problems"

`TODO` is a valid `TaskStatus` but not a valid bulk target — the guard is `isBulkStatusTarget`,
not `isTaskStatus`.

### AC-1.8 — Duplicate ids deduplicated
GIVEN an authenticated STORE_MANAGER (`token-manager`, `store_001`)
WHEN `bulkUpdateStatus` is called with `["act_restock_aisle4", "act_restock_aisle4"]` and status `DONE`
THEN `requested: 1`, `results` length 1, `updated: 1`, AND exactly one `task.status_changed` event
**Verified by:** — "deduplicates repeated ids"

## Out of scope for this sprint

- `src/activities/routes.ts` — sprint 2
- `src/app.ts`, `shared/events/events.types.ts`, any other module
- Bulk update of priority, category, or assignee

## Gates

- `npx tsc --noEmit` → 0 errors
- `npx eslint .` → 0 errors
- `npx jest --coverage` → all pass, thresholds met (`src/activities/service.ts` ≥80%)
- `npx jest tests/shared/architecture.test.ts` → passes

CONTRACT: READY
SPRINT: 1 of 2
