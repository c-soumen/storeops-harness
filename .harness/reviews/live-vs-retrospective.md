# Live vs Retrospective — Run 2 compared with Run 1

**Feature:** Shift handover bulk status update — `PATCH /api/activities/bulk-status`
**Run 1 (retrospective):** sprints generated 2026-09-26 (`614c5c2`, `e663aae`); Evaluator and Monitor
built afterwards and applied after the fact. Archive: `sprint-{1,2}-{generator-summary,evaluator-feedback,run-log}.md`.
**Run 2 (live):** spec approved by the developer 2026-10-01T02:56Z; Generator → Evaluator → Monitor run
in true loop position, each a fresh subagent invocation reading only files. Archive:
`sprint-{1,2}-live-{generator-summary,evaluator-feedback,checks,run-log}.*`.
**Independence control:** the live Generators and Evaluators were instructed not to read
`.harness/reviews/`. Only the live Monitors read run 1, as `monitor.agent.md` requires.

## 1. Headline

| | Sprint 1 run 1 | Sprint 1 run 2 | Sprint 2 run 1 | Sprint 2 run 2 |
|---|---|---|---|---|
| Verdict | PASS | **PASS** | PASS | **PASS** |
| Weighted total | 100 | **96** | 96 | **96** |
| DIM-A | 100 (11/11) | 100 (11/11) | 100 (11/11) | 100 (10/10) |
| DIM-B | 100 (11/11) | **91 (10/11)** | 92 (12/13) | 92 (11/12) |
| Hard gates | 7/7 | 7/7 | 7/7 | 7/7 |
| Iterations | 1 | 1 | 1 | 1 |
| Escalation | none | none | none | none |
| Generator diff | +364/−2 (greenfield) | **+6 test lines** | +123 (greenfield) | **+2 test lines** |
| Findings | 1 MINOR, 2 NOTE | 1 MINOR | 1 MAJOR, 1 MINOR, 1 NOTE | 1 MAJOR, 1 NOTE |
| verdict.mjs 3-run SHA-256 | `2f42f201…` ×3 | `39f5b1af…` ×3 | not recorded | `165f482b…` ×3 |

**Verdicts match in both sprints and no escalation fired.** At the verdict level, the harness
converged. Below the verdict level it did not. Section 3 has the detail.

## 2. Deltas

| # | Delta | Kind | Evidence |
|---|---|---|---|
| 1 | AC-2.6 `body`/`title` defect caught **at planning** (FV-1) instead of as a 231/232 test failure | AC caught earlier | `.harness/output/spec.md` §4; run 2 sprint 2 B13 PASS vs run 1 B13 FAIL. Correction #11 working as designed |
| 2 | AC-1.3's missing `store_002` fixture resolved in the contract, not mid-planning | AC caught earlier | `sprint-1-contract.md` AC-1.3 arrangement note |
| 3 | AC-1.7 case (c) `PAUSED` never asserted `details.field`, but run 1's Evaluator recorded it MET | **Run 1 error, caught by live Generator** | commit `d70ca7a` (+6 lines); run 1 feedback §3 "`details.field` asserted per case" |
| 4 | AC-2.3 cases (b), (c) never asserted `error.code`; run 1's Evaluator used the same wording as its Generator ("asserts `error.code` … per case") | **Run 1 error, caught by live Generator (repeat of #3)** | commit `0b12a90` (+2 lines); `sprint-2-generator-summary.md` vs `sprint-2-evaluator-feedback.md` AC-2.3 rows |
| 5 | Sprint 1 B6: PASS → FAIL on the same tests | Check-result divergence | B6 "every new event" read as event *name* (run 1) vs *emit site* (run 2) |
| 6 | Sprint 2 B5: PASS → FAIL (new MAJOR F-1) | Check-result divergence | Run 1 cited only AC-2.4; run 2 applied B5 to every rejection test (AC-2.2, AC-2.3) |
| 7 | Sprint 2 B6, A6: PASS → n/a | Check-result divergence | No n/a rule when the diff adds no `emit()` / names no event |
| 8 | Sprint 1 score 100 → 96 | Score change | Effect of #5. Under a correct run 1 reading of #3 it would also have been B13 FAIL → 96 |
| 9 | Sprint 2 total 96 = 96 | **Coincidence, not agreement** | Different failing checks (run 1 B13; run 2 B5) and different denominators |
| 10 | No regression | — | 232/232 tests, coverage 97.03% stmts throughout; `src/` byte-identical to run 1 (no `src/` file changed in run 2) |

## 3. New corrections surfaced

| # | Correction | Where the fix lands | Status |
|---|---|---|---|
| **#15** | **Check wording admits two readings**, so independent Evaluators record different results on identical code (B5, B6, A6). This breaks `evaluator.agent.md` Determinism property 2, *same artefacts → same check results*. Property 1 (same JSON → same verdict) held in every run | `grading-criteria/SKILL.md` §2 rows B5, B6, A6, B7: define "negative-path test", "new event" (= `emit()` added in the diff), and the n/a conditions | Proposed. Not applied: changing gate definitions is a developer decision (`CLAUDE.md` §4) |
| **#16** | **The Evaluator restated the Generator's claims as evidence.** This happened twice in run 1 (#3, #4), in exactly the gap `JOURNAL.md` "one thing I would design differently" predicted | `how-to-review/SKILL.md` §5: every case of a multi-case THEN cites the `file:line` of its assertion, and copied summary wording is not evidence. Run 2's Evaluator already cited lines per AC and did not repeat the error | Proposed |
| **#17** | **A MAJOR under PASS has no route.** `CLAUDE.md` §4 carries MAJORs forward only on CONDITIONAL PASS. Run 2's F-1 (B5) is open on the final sprint and goes nowhere | `CLAUDE.md` §4 PASS row: open MAJORs carry forward; on the final sprint they are listed in the feature-done report | Proposed. Open item: F-1, `tests/activities/routes.test.ts:242-248` |

## 4. Operational observations (live only — run 1 could not produce these)

| Signal | Value | Note |
|---|---|---|
| Wall-clock per agent | G1 703s · E1 551s · M1 235s · G2 545s · E2 908s · M2 219s | **~53 min** of agent time for a two-line-per-sprint diff. E2 is longest because it ran the curl gate |
| Actual tokens (Claude Code subagent meter) | 69.5k · 80.8k · 62.6k · 72.8k · 87.4k · 67.4k = **440.4k** | Generator + Evaluator + Monitor only (Planner not re-run in this session) |
| Monitor's estimate for the same six agents | 110.9k − 13.4k Planner = **97.5k** | **Under by ~4.5×**. Word count × 1.3 counts artefacts read and written. It does not count gate output, diffs, tool round-trips, or reasoning |
| Clock mismatch | Evaluator dated 2026-10-01 (UTC), Monitor dated 2026-09-30 (local) | Flagged by the live Monitor in both sprints. Artefacts have no single clock |
| Escalation proximity | None close; worst-case B-readings gave 86 (PASS threshold 85) | The nearest escalation was run 1's AC-2.6, a contract defect under a strict HG-B3, and FV-1 removed it |

## 5. Finding

**At the verdict level the harness converged.** Same verdicts, same iteration counts, no
escalation, no gate touched, and verdict.mjs byte-stable on every input. The Planner-side
correction #11 measurably moved a defect from Generator time to planning time.

**Below the verdict level it did not converge, and the live loop is what showed it.** Two
independent Evaluator runs disagreed on four check results over identical code. The equal 96 in
sprint 2 is a coincidence of two different deductions. Run 1's Evaluator also accepted
Generator claims twice as evidence, and both were false. Neither defect changed a verdict this
time, because both sat in soft checks with ≥10 points of headroom. Neither would be visible
without a second, independent run. Corrections #15–#17 are the result.
