# Spec: Shift handover bulk status update

**Source prompt:** "Add shift handover bulk update — PATCH /api/activities/bulk-status allowing outgoing shift staff to mark multiple operational activities as DONE or BLOCKED in a single request, with partial failure handling and an audit entry per updated task." (verbatim from `PROMPT.md`)
**Planner run:** 2026-09-26 — **live loop position**, run 2
**Sprints:** 2
**Supersedes:** the retrospective run archived as `.harness/reviews/sprint-{1,2}-*`

**Codebase read for this plan:** `src/activities/{types,service,routes,repository}.ts`,
`src/alerts/{types,service}.ts`, `src/shared/events/events.types.ts`,
`src/shared/errors/{AppError,errorHandler}.ts`, `src/staff/auth.middleware.ts`.

## 1. Intent

At the end of a shift, outgoing staff currently PATCH each completed or blocked activity one at a
time — a handover of fifteen activities is fifteen requests, and a partial failure leaves the
handover half-recorded with no way to tell which half. This feature accepts one request marking
many activities `DONE` or `BLOCKED` and returns a per-activity result saying exactly which took
effect and why the others did not. Each activity that actually changes raises the same audit event
a single-activity update would, so reporting and alerting cannot tell the two paths apart.

## 2. Scope

### In scope
- `PATCH /api/activities/bulk-status` accepting `{ ids: string[], status: "DONE" | "BLOCKED" }`
- Per-item outcome reporting: `updated`, `unchanged`, `not_found`, `forbidden`
- HTTP `207 Multi-Status` whenever the batch is processed, regardless of per-item outcomes
- Request-level validation (empty `ids`, unknown `status`, batch cap) rejected as `400`
- One `task.status_changed` event per activity that actually changed status
- `task.sla_breached` per activity moved to `BLOCKED`, matching single-update behaviour
- Duplicate ids deduplicated, reported once

### Out of scope
- Bulk update of fields other than `status` — would duplicate `updateTask` validation
- All-or-nothing rollback — the prompt asks for partial failure handling, the opposite semantic
- A new `AlertType` or bulk-specific event — `task.status_changed` already carries the audit
  payload; a parallel event would split the audit trail (R2)
- Any change to `src/alerts/**` — the existing subscriber must handle this unmodified

## 3. Affected modules and layers

| Module | Layer | Change |
|---|---|---|
| activities | types | `BULK_STATUS_TARGETS`, `BulkStatusTarget`, `BulkStatusOutcome`, `BulkStatusInput`, `BulkStatusResultItem`, `BulkStatusResult`, `isBulkStatusTarget` |
| activities | repository | `findByIds(ids)` — single lookup pass |
| activities | service | `bulkUpdateStatus(caller, input)`, `BULK_MAX_ITEMS = 50` |
| activities | routes | `PATCH /bulk-status`, registered **before** `PATCH /:id` |
| tests | activities | service tests (sprint 1), route tests (sprint 2) |

**Route ordering note for the Generator:** Express matches in registration order, so
`PATCH /bulk-status` must precede `PATCH /:id`, or `:id` captures the literal `bulk-status`.

## 4. Field and fixture verification (gate FV-1)

Every field and fixture referenced by any AC, verified by opening the declaring file.

| Referenced | Kind | Declared in | Holds the asserted value? |
|---|---|---|---|
| `Notification.title` | field | `src/alerts/types.ts:14` | ✅ — subscriber writes `` `SLA breach on activity ${payload.taskId}` `` (`src/alerts/service.ts`). **This is the field that names the activity** |
| `Notification.body` | field | `src/alerts/types.ts:15` | ⚠️ **CORRECTED** — holds `` `${payload.reason} (priority ${payload.priority}).` ``, i.e. the reason, **not** the activity id. AC-2.6 originally asserted the id was here |
| `Notification.type` | field | `src/alerts/types.ts:11` | ✅ — `SLA_BREACH` is a member of `ALERT_TYPES` |
| `BulkStatusResultItem.{id,outcome,code,status}` | fields | `src/activities/types.ts` | ✅ — all four exist with the asserted types |
| `BulkStatusResult.{requested,updated,results}` | fields | `src/activities/types.ts` | ✅ |
| `error.code` / `error.details.field` | fields | `AppError.toJSON()` | ✅ — `{ error: { code, message, details? } }` |
| `act_restock_aisle4` | fixture | `src/activities/repository.ts` seeds | ✅ — `store_001`, TODO, HIGH, assignee `usr_associate` |
| `act_planogram_home` | fixture | seeds | ✅ — `store_001`, IN_PROGRESS, MEDIUM, assignee `usr_lead` |
| `act_chiller_temp_check` | fixture | seeds | ✅ — `store_001`, **already DONE** (idempotency case) |
| a `store_002` activity | fixture | seeds | ❌ **ABSENT** — all three seeded activities are `store_001`. AC-1.3 must state how the test arranges one |
| `prg_backroom_refit` | fixture | `src/programmes/repository.ts` seeds | ✅ — `store_002`, PLANNING (usable to arrange the above) |
| `token-manager` / `token-lead` / `token-associate` | fixtures | `src/staff/repository.ts` seeds | ✅ |

**FV-1 result: 2 corrections applied, 0 blockers.**

1. **AC-2.6 rewritten** from "a `body` naming `act_restock_aisle4`" to "a `title` naming
   `act_restock_aisle4`". The original asserted the id in a field that holds the reason. This is
   correction #11, and this run is the first in which it was caught **before** the Generator.
2. **AC-1.3 states its own arrangement** rather than referencing a fixture that does not exist.
   Seeds must not be extended — `tests/reports/service.test.ts` asserts
   `activitiesByStore: { store_001: 3, store_002: 0 }`.

## 5. Architecture rules in play

| Rule | How this feature satisfies it |
|---|---|
| **R1 Module boundary** | Store scoping compares `caller.storeId` with the activity's own `storeId`. No cross-module repository access, and no cross-module read required |
| **R2 Event bus only** | The audit entry is `bus.emit('task.status_changed', …)` per changed activity; `bus.emit('task.sla_breached', …)` per BLOCKED transition. `activities` imports neither `alerts` nor `reports`. Alerting policy stays in `alerts`, which is not modified at all |
| **R3 Error contract** | Request-level failures throw `ValidationError` with `{ field }`. Per-item failures are **classified, not thrown**, carrying the same `code` strings (`NOT_FOUND`, `FORBIDDEN`) the error handler would have produced |
| **R4 Layer separation** | Route shapes input and picks the 207; service owns validation, authorization, classification, emission; repository only looks up |
| **R5 Read-only reports** | n/a — `reports` untouched |
| **R6 Test substance** | Every outcome class gets a criterion asserting the reported outcome **and** that non-updated activities were left unmodified |

## 6. Sprint breakdown

| Sprint | Title | Rationale for the boundary |
|---|---|---|
| 1 | Bulk status update in the activities service | Types, repository lookup, service method, unit tests. Partial-failure classification and authorization are the hard part and are fully testable with no HTTP surface. Ends green with every outcome class covered |
| 2 | HTTP surface and audit events | Route, request shaping, 207 response, route tests, curl verification. Depends on sprint 1. The audit emits are asserted here at their observable effect (the assignee's alert list), which needs the full stack |

Two sprints, not one: classification deserves its own contract so a finding there does not force
the HTTP layer to be re-reviewed. Not three: the emits are two lines inside sprint 1's loop and
cannot be observed without sprint 2's route.

## 7. Risks and open questions

1. **Who may bulk-update?** Resolved by consistency: `PATCH /api/activities/:id` permits **any
   authenticated caller in the same store** (it checks `storeId` only). Bulk uses the identical
   rule so the two endpoints cannot diverge. Restricting handover to `DEPARTMENT_LEAD` and above
   would be a change to **both** endpoints and a separate feature. *Developer decision on the
   retrospective run: keep as proposed.*
2. **Idempotency.** An activity already in the target status reports `unchanged` and emits **no**
   event; without this a retried handover doubles the audit trail. *Approved.*
3. **Batch cap 50.** Arbitrary but bounded. If the client has a real handover size, it should come
   from them. *Approved.*
4. **`GET /api/activities/bulk-status` is not created** — a future GET on that path would collide
   with `GET /:id` and needs the same ordering care.
5. **Pre-existing implementation.** The feature was already built by the retrospective run
   (commits `614c5c2`, `e663aae`). This run therefore verifies existing code against corrected
   contracts rather than generating greenfield. Stated so no reader mistakes the Generator's small
   diff for the feature's true cost. See the comparison in the run logs.

## 8. Definition of done (whole feature)

- [ ] `npx tsc --noEmit` → 0 errors
- [ ] `npx eslint .` → 0 errors
- [ ] `npx jest --coverage` → all pass; service ≥80%, routes ≥70%, shared ≥60%, overall ≥70%
- [ ] `npx jest tests/shared/architecture.test.ts` → passes (R1, R3, R4, R5)
- [ ] `PATCH /api/activities/bulk-status` verified via curl showing a 207 with mixed outcomes
- [ ] Blocking through the bulk endpoint produces an `SLA_BREACH` alert for the assignee, with the
      activity id in `title`, identical to the single-update path
- [ ] No new event names in `shared/events/events.types.ts`; no new imports between domain modules
- [ ] `src/alerts/**` unmodified

---
STATUS: APPROVED
APPROVED-BY: developer, in-session (AskUserQuestion response "APPROVED"), 2026-10-01T02:56Z
