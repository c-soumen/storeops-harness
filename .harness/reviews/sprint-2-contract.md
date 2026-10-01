# Sprint 2 Contract: HTTP surface and audit events

**Spec:** spec.md §6 sprint 2 (live run 2)
**Depends on:** sprint 1 (`ActivityService.bulkUpdateStatus` and its types)

## Objective

Expose `bulkUpdateStatus` as `PATCH /api/activities/bulk-status`, returning `207 Multi-Status`
with the per-item results, and prove end-to-end that a bulk block produces the same `SLA_BREACH`
alert for the assignee that a single-activity block does — with `src/alerts/**` unmodified.

## Files expected to change

| Path | Layer | Change |
|---|---|---|
| `src/activities/routes.ts` | routes | `PATCH /bulk-status`, registered **before** `PATCH /:id` |
| `tests/activities/routes.test.ts` | test | AC-2.1 … AC-2.6 |

Request body: `{ "ids": ["act_x", "act_y"], "status": "DONE" }`.
Response body: sprint 1's `BulkStatusResult`, serialised as-is. The route adds no fields.

## Acceptance criteria

### AC-2.1 — 207 with mixed outcomes
GIVEN an authenticated STORE_MANAGER (`Authorization: Bearer token-manager`, `store_001`)
WHEN they `PATCH /api/activities/bulk-status` with `{ "ids": ["act_restock_aisle4", "act_missing"], "status": "DONE" }`
THEN status is `207`, AND `body.updated` is `1`, AND `body.results` contains one `outcome: "updated"` for `act_restock_aisle4` and one `outcome: "not_found"` with `code: "NOT_FOUND"` for `act_missing`
**Verified by:** `tests/activities/routes.test.ts` — "returns 207 with per-item outcomes"

### AC-2.2 — 207 even when every item fails
GIVEN an authenticated STORE_MANAGER (`token-manager`, `store_001`)
WHEN they `PATCH /api/activities/bulk-status` with `{ "ids": ["act_missing"], "status": "DONE" }`
THEN status is `207` — the batch was processed, the item was not — AND `body.updated` is `0`, AND `body.results[0].outcome` is `"not_found"`
**Verified by:** — "returns 207 when no item could be updated"

207 describes the batch, not the items. A 404 here would tell the caller the endpoint is absent.

### AC-2.3 — Request-level validation surfaces as 400
GIVEN an authenticated STORE_MANAGER (`token-manager`, `store_001`)
WHEN they PATCH with (a) `{ "ids": [], "status": "DONE" }`, (b) `{ "ids": ["act_restock_aisle4"], "status": "TODO" }`, or (c) `{ "status": "DONE" }`
THEN each status is `400`, AND `body.error.code` is `"VALIDATION_ERROR"`, AND `body.error.details.field` is `"ids"` for (a) and (c), `"status"` for (b)
**Verified by:** — "returns 400 for request-level problems"

### AC-2.4 — Unauthenticated request refused
GIVEN no `Authorization` header
WHEN a PATCH is sent with a valid body
THEN status is `401`, AND `body.error.code` is `"UNAUTHORIZED"`, AND `act_restock_aisle4` still reads `TODO`
**Verified by:** — "returns 401 without a token"

### AC-2.5 — Route ordering: single-item PATCH still works
GIVEN an authenticated STORE_MANAGER (`token-manager`, `store_001`)
WHEN they `PATCH /api/activities/act_restock_aisle4` with `{ "status": "IN_PROGRESS" }`
THEN status is `200` and `body.status` is `"IN_PROGRESS"`
**Verified by:** — pre-existing "returns 200 with the updated activity" must still pass

Registering `PATCH /:id` before `PATCH /bulk-status` breaks the new endpoint; this is the most
likely implementation mistake, so it gets its own criterion.

### AC-2.6 — Bulk block produces the same alert as a single block
GIVEN an authenticated STORE_MANAGER (`token-manager`, `store_001`) and `act_restock_aisle4` assigned to `usr_associate`
WHEN they `PATCH /api/activities/bulk-status` with `{ "ids": ["act_restock_aisle4"], "status": "BLOCKED" }`
THEN `GET /api/alerts` as `Bearer token-associate` returns one more alert than before, AND that alert has `type: "SLA_BREACH"`, AND its **`title`** names `act_restock_aisle4`, AND its `body` names the reason (`BLOCKED`)
**Verified by:** — "raises an SLA alert for the assignee via the bulk endpoint"

**Field corrected by gate FV-1** (spec §4): the previous run asserted the activity id in `body`.
`src/alerts/service.ts` composes `title: `SLA breach on activity ${taskId}`` and
`body: `${reason} (priority ${priority}).``, so the id is in **`title`**. `src/alerts/**` must not
be modified to match a mis-stated criterion — the single-update path depends on this composition.

## Out of scope for this sprint

- `src/activities/{service,repository,types}.ts` — if sprint 2 needs one, sprint 1 was graded PASS
  in error; escalate rather than patching across the boundary
- `src/alerts/**` — the existing subscriber must handle this unmodified, which is the point of R2
- A GET on `/api/activities/bulk-status`

## Gates

- `npx tsc --noEmit` → 0 errors
- `npx eslint .` → 0 errors
- `npx jest --coverage` → all pass, thresholds met (`src/activities/routes.ts` ≥70%)
- `npx jest tests/shared/architecture.test.ts` → passes
- Manual: `curl -i -X PATCH -H "Authorization: Bearer token-manager" -H "Content-Type: application/json" -d '{"ids":["act_restock_aisle4","act_missing"],"status":"DONE"}' http://localhost:3000/api/activities/bulk-status` → `207` with mixed outcomes

CONTRACT: READY
SPRINT: 2 of 2
