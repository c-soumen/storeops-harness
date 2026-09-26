# Generator Summary — Sprint 2, Iteration 1

**Contract:** sprint-2-contract.md
**Spec:** spec.md §5 sprint 2
**Feature:** Shift handover bulk status update — HTTP surface and audit events
**Depends on:** sprint 1 (`ActivityService.bulkUpdateStatus` and its types), committed as `614c5c2`

## Acceptance criteria self-check

| AC | Summary | Status | Verified by | Note |
|---|---|---|---|---|
| AC-2.1 | 207 with mixed outcomes | ✅ | `tests/activities/routes.test.ts` — "returns 207 with per-item outcomes" | Asserts `requested`, `updated`, and both result items by exact shape |
| AC-2.2 | 207 even when every item fails | ✅ | — "returns 207 when no item could be updated" | `updated: 0`, outcome `not_found`, status still 207 |
| AC-2.3 | Request-level validation surfaces as 400 | ✅ | — "returns 400 for request-level problems" | All three cases; asserts `error.code` and `error.details.field` per case |
| AC-2.4 | Unauthenticated request refused | ✅ | — "returns 401 without a token" | Also re-reads the activity to prove status unchanged |
| AC-2.5 | Route ordering: single-item PATCH still works | ✅ | — existing "returns 200 with the updated activity" (unmodified) + curl | The pre-existing test passes untouched, which is the regression signal the AC asked for |
| AC-2.6 | Bulk block produces the same alert as a single block | ✅ | — "raises an SLA alert for the assignee via the bulk endpoint" | Alert count +1, `type: SLA_BREACH`. **Assertion field corrected — see Deviations** |

Legend: ✅ met · ⚠️ partially met (explain) · ❌ not met (explain)

## Files changed

| Path | Layer | Change | Lines |
|---|---|---|---|
| `src/activities/routes.ts` | routes | `PATCH /bulk-status` registered before `PATCH /:id`; `BulkStatusInput`/`BulkStatusTarget` type imports | +23 |
| `tests/activities/routes.test.ts` | test | AC-2.1 … AC-2.4, AC-2.6 | +99 |

Two files, both inside the contract's expected-changes table. `src/activities/service.ts`,
`repository.ts`, `types.ts`, `src/alerts/**`, and `src/app.ts` untouched, as the contract requires.

## Gate results

| Gate | Command | Result |
|---|---|---|
| Type check | `npx tsc --noEmit` | PASS — 0 errors |
| Lint | `npx eslint .` | PASS — 0 errors |
| Tests | `npx jest --coverage` | PASS — 232 tests, 12 suites; 97.03% statements, 90.30% branches, 95.85% functions, 97.02% lines; all thresholds met |
| Architecture | `npx jest tests/shared/architecture.test.ts` | PASS — 14 tests, ran inside the full suite |
| Manual (contract gate) | `curl -i -X PATCH … /api/activities/bulk-status` | PASS — 207 with mixed per-item outcomes; see *Curl verification* |

**First gate run failed** (231/232) and was fixed before submission — see Deviations.

## Architecture rule compliance

| Rule | How this sprint satisfies it |
|---|---|
| R1 Module boundary | Route imports only its own module's service and types. No repository import anywhere in `routes.ts` (asserted by `architecture.test.ts`) |
| R2 Event bus only | No new emit added this sprint. The audit and SLA events come from sprint 1's service; `src/alerts/**` reacted **completely unmodified**, which is the event-bus design paying off rather than a claim about it |
| R3 Error contract | Route throws `ValidationError` for a non-array `ids` and lets everything else reach `errorHandler`. No hand-built error body, no `res.status(400).json({error})` |
| R4 Layer separation | Route does shape validation only (`asObject`, `Array.isArray`, `optionalString` per element) and selects the 207 status. Enum validation stays in the service via `isBulkStatusTarget`; no business rule in the route |
| R5 Read-only reports | n/a — `reports` untouched |
| R6 Test substance | AC-2.4 asserts the activity is still `TODO` after the 401; AC-2.3 asserts `details.field` per case, not just the code; AC-2.6 asserts the alert's delta, type, and content rather than only the 207 |

## Curl verification

Run against a freshly built `dist/` on `:3000`, port confirmed free beforehand:

- `PATCH /api/activities/bulk-status` with two valid ids + one unknown → `207`, mixed
  `updated` / `not_found` / `unchanged` outcomes in one body
- `PATCH /api/activities/act_restock_aisle4` (single item) → `200` — route ordering intact
- `PATCH …/bulk-status` with no `ids` → `400`, `VALIDATION_ERROR`, `details.field: "ids"`
- `PATCH …/bulk-status` with no token → `401`
- Bulk-blocking `act_planogram_home` (assignee `usr_lead`) then `GET /api/alerts` as
  `token-lead` → new `SLA_BREACH` alert present

## Deviations from the contract

1. **AC-2.6 assertion field corrected from `body` to `title`.** The AC reads "that alert has
   `type: "SLA_BREACH"` and a **body** naming `act_restock_aisle4`". In the `Notification` domain
   type, `body` and `title` are distinct fields, and the baseline `alerts` subscriber composes the
   task id into `title` (`SLA breach on activity ${taskId}`) with the reason in `body`
   (`Activity moved to BLOCKED (priority HIGH).`). My first test asserted `breach.body` literally
   and **failed** (231/232).

   Resolved by fixing the test, not the code: `src/alerts/**` is explicitly out of scope for this
   sprint, and moving the id into `body` would change behaviour the single-update path already
   relies on. The test now asserts `title` contains the id **and** `body` contains `BLOCKED`, so
   the alert is pinned either way. The AC's intent — the alert names the activity — is met.

   **This is a Planner imprecision, not an implementation gap:** the contract used a domain field
   name loosely. Logged as correction #11 for the Evaluator's hard gates.

2. **Per-element id validation names an indexed field** (`ids[0]`, `ids[1]`) rather than `ids`.
   The contract did not specify this. Chosen so a caller with one bad element in a batch of forty
   learns which element; the request-level `ids` failures still report `field: "ids"` as AC-2.3
   requires.

## Known gaps

1. **`optionalString(id, …) ?? ''` maps a non-string element to an empty string**, which the
   service then filters out during de-duplication. Net effect: a body like
   `{"ids":["act_x", 42], …}` reports `field: "ids[1]"` as a 400 — correct — but
   `{"ids":[null], …}` becomes an empty list and reports `field: "ids"`. Both are 400s with
   accurate fields, so no AC is violated, but the two paths reach it differently. Worth an
   Evaluator opinion on whether that is acceptable or should be one explicit branch.
2. **No test for a batch mixing all four outcome types in a single request.** Each outcome is
   covered, and sprint 1 covers `forbidden` and `unchanged` at the service layer, but the route
   layer never sees all four at once. Low risk (the route does no per-item logic) — flagged for
   completeness.
3. **The 50-item cap boundary remains untested**, carried forward unchanged from sprint 1's known
   gaps. Still blocked by the "do not extend seeds" rule.
4. **Jest still prints "a worker process has failed to exit gracefully"** on the full parallel run.
   Pre-existing since the baseline; `--detectOpenHandles` on individual suites reports nothing and
   the run exits 0. Not introduced by this sprint.

---
GENERATOR: COMPLETE
SPRINT: 2 of 2
ITERATION: 1
GATES: tsc=PASS eslint=PASS jest=PASS architecture=PASS
