# Run Log — Sprint 2

**Feature:** Shift handover bulk status update
**Sprint:** 2 of 2 — HTTP surface and audit events
**Logged:** 2026-09-26

## Outcome

| Field | Value |
|---|---|
| Sprint ID | sprint-2 |
| Verdict | PASS |
| Weighted total | 96 |
| DIM-A score | 100 (weight 55%) |
| DIM-B score | 92 (weight 45%) |
| Iterations used | 1 of 3 |
| Escalation flag | NONE |
| Hard gates | 7 of 7 passed |
| Files changed | 2 |
| Lines added / removed | +123 / −0 |
| Commit | `e663aae` |

## Gate results

| Gate | Result | Notes |
|---|---|---|
| `npx tsc --noEmit` | PASS | 0 errors |
| `npx eslint .` | PASS | 0 errors |
| `npx jest --coverage` | PASS | 232 tests / 12 suites; 97.03% stmts, 90.30% br, 95.85% fn, 97.02% ln |
| `npx jest tests/shared/architecture.test.ts` | PASS | 14 tests |
| Manual verification | PASS | `PATCH /api/activities/bulk-status` → 207 with three distinct outcomes in one body; single-item PATCH → 200; no `ids` → 400; no token → 401; bulk BLOCKED → `SLA_BREACH` alert for the assignee |

**Intra-iteration gate failure:** the Generator's first `jest` run failed 231/232 (AC-2.6 asserting
the wrong field). Fixed before submission and disclosed in its *Deviations*. This did **not**
consume a harness iteration — the Generator's own gate loop is inside iteration 1, by design
(`generator.agent.md` procedure step 5). Worth tracking: it is the first instance of a contract
defect surfacing as a test failure rather than as an escalation.

## Findings summary

| Severity | Count | Ids |
|---|---|---|
| BLOCKER | 0 | — |
| MAJOR | 1 | F-1 (AC-2.6 names `body` where the value lives in `title`) → DIM-B/B13 FAIL |
| MINOR | 1 | F-2 (two paths to the same 400) |
| NOTE | 1 | F-3 (all four outcomes never co-occur at route level) |

## Estimated token cost

| Agent | Read | Written | Est. tokens |
|---|---|---|---|
| Planner | — (planned in sprint 1; marginal cost zero) | — | 0 |
| Generator | app-context 1109 + architecture-principles 1468 + coding-conventions 1292 + api-integration 1029 + how-to-test 1049 + contract 668 + spec 1196 + source ~823 (routes, types) = ~8634 w | code+tests ~123 lines ≈ 750 w + summary 1124 w = ~1874 w | ~13,660 |
| Evaluator | architecture-principles 1468 + how-to-review 1714 + grading-criteria 1998 + contract 668 + spec 1196 + summary 1124 + diff ~750 w = ~8918 w | feedback 1726 w + checks.json ~120 w = ~1846 w | ~13,993 |
| Monitor | app-context 1109 + grading-criteria 1998 + feedback 1726 + summary 1124 + sprint-1 run log 700 = ~6657 w | this log ~750 w | ~9,628 |
| **Sprint total** | | | **~37,300** |

Method: word count × 1.3. Estimate only; no meter is available.

**Cost observation:** sprint 2 cost ~26% less than sprint 1 (~37.3k vs ~50.6k) despite an extra
skill file being read, because the Planner cost was already sunk and the diff was a third the size.
Feature total ≈ **88k tokens** for two sprints, one iteration each.

## Quality trend notes

- **vs previous sprints:** DIM-A held at 100. **DIM-B fell 100 → 92**, entirely attributable to
  F-1. Iterations stayed at 1, hard gates stayed 7/7, no escalation. Verdict stayed PASS, but the
  score moved for a real reason — which is the behaviour `grading-criteria` §5.4 wants, as opposed
  to a flat 100 that would tell the trend line nothing.
- **Repeated findings:** the **batch-cap boundary gap now appears in both sprints** (sprint 1 F-1,
  carried into sprint 2's known gaps). Two occurrences is the threshold at which this stops being
  bad luck and becomes a missing skill-file rule. **Action: add the boundary-value rule to
  `how-to-test`.**
- **Skill file drift candidates:**
  - `sprint-decomposition` — **highest priority.** F-1 is the second fixture/field-accuracy defect
    in two sprints (sprint 1: an AC referencing a non-existent `store_002` activity; sprint 2: an
    AC naming `body` when the value is in `title`). Both are the same underlying gap: acceptance
    criteria assert against the domain model without anyone verifying the assertion is *possible*.
    Candidate rule for the §6 self-check: *every field and fixture named in an AC must be verified
    to exist on the type or in the seeds; if it does not, the AC states how it is arranged.*
  - `how-to-test` — boundary values where fixtures cannot be extended (repeated finding, above).
  - `grading-criteria` — needed two corrections during its own first use (B3/B13 split, and the
    rule that a MAJOR finding must cite a failed check). Both are now folded in; watch whether a
    third emerges on the next sprint, which would suggest the checklist is still under-specified.
- **Harness health:** good. Two sprints, two PASS verdicts, one iteration each, zero escalations,
  zero gates weakened, zero unauthorised file changes. The one MAJOR finding is a **Planner**
  defect caught by the Evaluator and routed back correctly — the loop worked in the direction it
  was designed to work. The event-bus seam proved itself: a new endpoint inherited correct
  alerting with `src/alerts/**` untouched.

---
MONITOR: LOGGED
SPRINT: 2 of 2
VERDICT: PASS
ITERATIONS: 1
ESCALATION: NONE
EST_TOKENS: 37300
