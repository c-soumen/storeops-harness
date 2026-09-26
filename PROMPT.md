# Demonstration Run — Feature Prompt

This is the prompt used to invoke the harness for the demonstration run
(case study §5.5 / §6.3). It is entered verbatim by the developer as the single active step that
starts the run.

## Prompt

```
@planner Add shift handover bulk update — PATCH /api/activities/bulk-status allowing
outgoing shift staff to mark multiple operational activities as DONE or BLOCKED in a
single request, with partial failure handling and an audit entry per updated task.
```

## Why this feature

Chosen from the four suggested features in case study §3.4. It was selected over the
alternatives because it exercises all four of the client failure modes the harness exists to
prevent:

| Failure mode | How this feature exercises it |
|---|---|
| 1 — cross-module repository imports | Bulk update must resolve activities and check store scoping without reaching into `programmes` or `staff` repositories |
| 2 — raw `Error` throws | Partial failure means per-item error classification — `NotFoundError`, `ForbiddenError`, `ValidationError` — and it is tempting to shortcut with a raw throw |
| 3 — tests that assert only status codes | A 207 multi-status response is meaningless unless tests assert the per-item outcomes *and* that unaffected activities were not modified |
| 4 — missing event bus integration | The audit entry per updated task must be raised as an event, not written into a sibling module |

It also lands entirely in new code across all three layers (repository → service → routes), so
the Generator's output is unambiguously attributable to the harness rather than to the baseline
scaffold.

**Rejected alternatives and why:**

- *Regional rollup report* — `reports/service.ts` already implements `generateRegionalRollup` in
  the baseline, so the harness would be demonstrating against a half-built feature. Weaker
  evidence.
- *SLA breach alerting* — depends on a configurable grace period and wall-clock time, which makes
  deterministic acceptance criteria harder to write and the Evaluator's verdict less stable.
- *Planogram task template* — good fit, but narrower: it does not force partial-failure semantics.

## Expected shape of the run

Per `spec.md` as produced by the Planner. The anticipated decomposition is two sprints:

1. Bulk status update in the `activities` service (repository + service + types + unit tests)
2. HTTP surface and audit events (route, 207 multi-status response, `task.status_changed` per
   updated activity, route tests, curl verification)

Artefacts from the run are archived in `.harness/reviews/`.
