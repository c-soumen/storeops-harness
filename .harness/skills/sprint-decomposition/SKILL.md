# Skill: sprint-decomposition

**Purpose.** Turn a one-line feature prompt into a `spec.md` and a set of sprint contracts whose
acceptance criteria are machine-checkable. The Generator can only build what this decomposition
makes unambiguous; the Evaluator can only pass what it can verify. Vague criteria are the single
biggest source of harness churn.

**Read by:** planner.

---

## 1. Where sprint boundaries go

Split on **layer completeness**, not on file count. A sprint must end at a point where
`tsc --noEmit`, `eslint .`, and `jest --coverage` all pass. A sprint that leaves the build red is
mis-drawn, however small.

Three heuristics, in priority order:

1. **One sprint per vertical slice that can ship.** Repository + service + routes + tests for one
   coherent capability. Not "sprint 1 = all repositories, sprint 2 = all services" — that leaves
   sprint 1 unverifiable and untestable.
2. **Split when a second module gets involved.** If the feature needs `activities` to change *and*
   `alerts` to react, that is two sprints: the publisher (emit the event) and the subscriber (react
   to it). The event contract is the seam, and it is a clean handoff.
3. **Split when the sprint exceeds ~6 changed files or ~250 added lines.** Beyond that the
   Generator's self-check degrades and the Evaluator's feedback gets vague. Prefer three small
   sprints to one large one.

Do **not** create a sprint for: type definitions alone, a test-only pass, or a refactor with no
behaviour change. Fold those into the sprint that needs them.

Target: **1–3 sprints** for a feature of the size listed in the case study §3.4. If your
decomposition yields more than 4, the feature prompt is too broad — say so in `spec.md` under
*Open questions* rather than silently splitting into ten.

## 2. Acceptance criteria: GIVEN / WHEN / THEN

Every criterion uses this form, and every clause must be checkable by reading code or running a
test. Write the criterion so that a reviewer can name the test that proves it.

**Testable:**
```
AC-1.3  GIVEN an authenticated STORE_MANAGER and a bulk request containing
        two activity ids from their own store and one from store_002
        WHEN they PATCH /api/activities/bulk-status with status DONE
        THEN the response is 207 with results[] listing two entries of
             outcome "updated" and one of outcome "forbidden" with
             code "FORBIDDEN", AND the store_002 activity status is unchanged
```

**Not testable — rewrite these:**

| Vague criterion | Why it fails | Fix |
|---|---|---|
| "THEN the endpoint handles errors gracefully" | No observable outcome | Name the status code, the `code` value, and the unchanged state |
| "THEN performance is acceptable" | No threshold | Drop it, or state a measurable bound |
| "THEN the code follows project conventions" | Not a criterion, it is a gate | Remove — `architecture-principles` covers it |
| "THEN an alert is sent" | Unobservable as written | "THEN `GET /api/alerts` as the assignee returns an entry with `type: SLA_BREACH`" |
| "WHEN the user updates tasks" | Which user, which role? | Name the role and the store, since authorization branches on both |

**Rules for clause writing:**

- **GIVEN** names the caller's role *and* store when authorization or scoping is involved — StoreOps
  branches on both (`caller.storeId`, `isManagerRole`). Reference seeded fixtures by id
  (`act_restock_aisle4`, `prg_spring_reset`, `token-manager`) rather than inventing data.
- **WHEN** is a single action: one HTTP call, or one service method call with named arguments.
- **THEN** states the observable result: status code, response body shape, the specific `AppError`
  subclass / `code` value, persisted state, and any event emitted. Use `AND` for additional
  observable outcomes; do not bundle two different actions into one criterion.

**Every error path gets its own criterion.** If the service can throw `ValidationError`,
`NotFoundError`, and `ForbiddenError`, that is three criteria, each naming the subclass. This is
what prevents failure mode 3 (tests that assert status codes without verifying the business rule).

**Every cross-module effect gets a criterion asserted at the effect**, not at the emit call:
"THEN `GET /api/alerts` as `usr_associate` includes an `SLA_BREACH` alert" — not "THEN
`task.sla_breached` is emitted".

## 3. `spec.md` format

Written to `.harness/output/spec.md`. Must end with the approval marker on its own line.

```markdown
# Spec: <feature name>

**Source prompt:** <verbatim from PROMPT.md>
**Planner run:** <ISO date>
**Sprints:** <n>

## 1. Intent
<2–4 sentences: what changes for the store team, in domain language.>

## 2. Scope
### In scope
- <bullet per behaviour>
### Out of scope
- <bullet per thing deliberately excluded, with one-line reason>

## 3. Affected modules and layers
| Module | Layer | Change |
|---|---|---|
| activities | routes | new PATCH /api/activities/bulk-status |
| activities | service | new bulkUpdateStatus method |

## 4. Architecture rules in play
<Name the specific rules from architecture-principles this feature touches and how
compliance will be achieved. E.g. "R2: the audit trail is raised as
task.status_changed per updated activity; activities does not import alerts.">

## 5. Sprint breakdown
| Sprint | Title | Rationale for the boundary |
|---|---|---|
| 1 | <title> | <why the cut is here> |

## 6. Risks and open questions
- <anything the Planner could not resolve from the prompt + skills>

## 7. Definition of done (whole feature)
- [ ] `npx tsc --noEmit` → 0 errors
- [ ] `npx eslint .` → 0 errors
- [ ] `npx jest --coverage` → all pass, thresholds met
- [ ] New endpoint verified against the running app via curl
- [ ] <feature-specific items>

---
STATUS: AWAITING APPROVAL
```

Nothing downstream may run while that marker reads `AWAITING APPROVAL`. The developer types
`APPROVED` to release the loop.

## 4. `sprint-N-contract.md` format

Written to `.harness/output/sprint-N-contract.md`, one file per sprint.

```markdown
# Sprint <N> Contract: <title>

**Spec:** spec.md §5 sprint <N>
**Depends on:** <sprint N-1, or "none">

## Objective
<one paragraph>

## Files expected to change
| Path | Layer | Change |
|---|---|---|
| src/activities/types.ts | types | add BulkStatusInput, BulkStatusResult |
| src/activities/service.ts | service | add bulkUpdateStatus |
| tests/activities/service.test.ts | test | AC-1.1 … AC-1.5 |

## Acceptance criteria
### AC-<N>.1 — <short name>
GIVEN <…>
WHEN <…>
THEN <…>
**Verified by:** <test file + test name, or command>

## Out of scope for this sprint
- <bullet>

## Gates (all must pass before this sprint can be graded PASS)
- `npx tsc --noEmit` → 0 errors
- `npx eslint .` → 0 errors
- `npx jest --coverage` → all pass, coverage thresholds met
- `npx jest tests/shared/architecture.test.ts` → passes (R1, R3, R4, R5)
```

Every AC carries a **Verified by** line. If the Planner cannot name the test that would prove a
criterion, the criterion is not yet testable — rewrite it.

## 5. Worked example — feature to sprints

Prompt: *"Add shift handover bulk update — PATCH /api/activities/bulk-status allowing outgoing
shift staff to mark multiple operational activities as DONE or BLOCKED in a single request, with
partial failure handling and an audit entry per updated task."*

| Sprint | Title | Boundary rationale |
|---|---|---|
| 1 | Bulk status update in the activities service | Repository + service + types + tests. Ends green and fully unit-tested without any HTTP surface. Splitting here keeps the authorization and partial-failure logic reviewable on its own. |
| 2 | HTTP surface and audit events | Route, request shaping, 207 multi-status response, one `task.status_changed` per updated activity, route tests + curl verification. Depends on sprint 1. |

Two sprints, not one: the partial-failure semantics (per-item outcomes, no all-or-nothing
rollback) is the hard part and deserves its own contract. Not three: the audit events are a
two-line emit inside the loop built in sprint 2 and cannot be verified independently of it.

Sample criterion from sprint 1:

```
AC-1.2  GIVEN an authenticated DEPARTMENT_LEAD (token-lead, store_001)
        WHEN bulkUpdateStatus is called with ids
             ["act_restock_aisle4", "act_missing"] and status BLOCKED
        THEN the result lists act_restock_aisle4 as outcome "updated" with
             status BLOCKED, AND act_missing as outcome "not_found" with
             code "NOT_FOUND", AND no exception propagates to the caller
        Verified by: tests/activities/service.test.ts
             "reports per-item outcomes without failing the whole batch"
```

Note what that criterion pins down: partial failure is **per-item reporting**, not a thrown
`NotFoundError`. That decision belongs in the contract, not in the Generator's imagination.

## 6. Planner self-check before writing the approval marker

- [ ] Every sprint ends with the build green
- [ ] Every AC is GIVEN/WHEN/THEN with an observable THEN
- [ ] Every AC names the role **and** store where authorization applies
- [ ] Every error path has its own AC naming the `AppError` subclass
- [ ] Every cross-module effect is asserted at the effect, not the emit
- [ ] Every AC has a **Verified by** line
- [ ] Fixtures referenced by seeded id, not invented
- [ ] Affected-modules table names a layer for every changed file
- [ ] Architecture rules in play are named explicitly (§4 of spec.md)
- [ ] Sprint count is 1–3 (4 needs justification; 5+ means the prompt is too broad)
