# Run Log — Sprint 2

> **LIVE run 2.** Generator and Evaluator ran in true loop position, each a fresh invocation, after
> sprint 1 live PASS (`d70ca7a` test fix, `d24d76c` archive). Prior logs `sprint-1-run-log.md` and
> `sprint-2-run-log.md` are from RETROSPECTIVE run 1; `sprint-1-live-run-log.md` is this run.
> Mode: verification of pre-existing code `e663aae` against the FV-1-corrected contract (spec §7 item 5).

**Feature:** Shift handover bulk status update
**Sprint:** 2 of 2 — HTTP surface and audit events
**Logged:** 2026-09-30

## Outcome
| Field | Value |
|---|---|
| Sprint ID | sprint-2 (live run 2) |
| Verdict | PASS |
| Weighted total | 96 |
| DIM-A score | 100 (weight 55%) — 10/10 applicable |
| DIM-B score | 92 (weight 45%) — 11/12 applicable (B5 FAIL) |
| Iterations used | 1 of 3 |
| Escalation flag | NONE (`.harness/output/escalation.md` absent) |
| Hard gates | 7 of 7 passed |
| Files changed | 1 (`tests/activities/routes.test.ts`, uncommitted at log time) |
| Lines added / removed | +2 / -0 |

## Gate results
| Gate | Result | Notes |
|---|---|---|
| `npx tsc --noEmit` | PASS | 0 errors; Generator and Evaluator agree |
| `npx eslint .` | PASS | 0 errors |
| `npx jest --coverage` | PASS | 232/232, 12 suites; lines 97.0%, branches 90.3%; `activities/routes.ts` 100% stmts |
| `npx jest tests/shared/architecture.test.ts` | PASS | 14/14 |
| Build + manual (B12) | PASS | 207 contract curl, 200 single PATCH, 400 missing ids, 401 no token, bulk BLOCKED gives `SLA_BREACH` (`title` has id, `body` has reason). Re-performed independently by the Evaluator; :3000 freed |
| `verdict.mjs` determinism | PASS | 3 runs, identical SHA-256 `165f482b…` |

## Findings summary
| Severity | Count | Ids |
|---|---|---|
| BLOCKER | 0 | — |
| MAJOR | 1 | F-1 (AC-2.2 / AC-2.3(b) negative paths never re-read state) → DIM-B/B5 FAIL. **Open under PASS** |
| MINOR | 0 | — |
| NOTE | 1 | F-2 (pre-existing status-only route tests :164, :172; outside the diff) |

## Estimated token cost
| Agent | Read | Written | Est. tokens |
|---|---|---|---|
| Planner | — (charged to sprint 1) | — | 0 |
| Generator | generator.agent 1331 + app-context 1109 + architecture-principles 1468 + coding-conventions 1292 + api-integration 1029 + how-to-test 1049 + contract 675 + spec 1372 + routes.ts 462 + routes.test.ts 975 = ~10,762 w | +2 lines ≈ 15 w + summary 795 w = ~810 w | ~15,000 |
| Evaluator | evaluator.agent 1341 + architecture-principles 1468 + how-to-review 1714 + grading-criteria 1998 + contract 675 + spec 1372 + summary 795 + diff/source ~1437 = ~10,800 w | feedback 1567 + checks.json ~80 = ~1647 w | ~16,200 |
| Monitor | monitor.agent 1159 + app-context 1109 + grading-criteria 1998 + feedback 1567 + summary 795 + run logs 668 + 900 + 1322 + retro sprint-2 feedback 1726 + checks.json ×2 ~160 + retro summary excerpt ~100 = ~11,504 w | this log ~1700 w | ~17,200 |
| **Sprint total** | | | **~48,400** |

Method: word count × 1.3. Estimate only — no meter is available. Includes agent-definition files
(as in `sprint-1-live-run-log.md`; run 1 omitted them). Like-for-like without them (3,831 w ≈ 5,000
tokens): ~43,400 vs run 1 sprint 2's ~37,300 (+16%). The delta is almost entirely the Monitor
(~17.2k vs ~9.6k) reading cross-run comparison inputs; Generator and Evaluator are within ~10% of run 1.

## Feature-level summary (LIVE run 2 vs RETROSPECTIVE run 1)
| | Run 1 (retrospective) | Run 2 (live) |
|---|---|---|
| Sprints / verdicts | 2 / PASS 100, PASS 96 | 2 / PASS 96, PASS 96 |
| Iterations | 1 + 1 = 2 | 1 + 1 = 2 |
| Escalations | 0 | 0 |
| Code change | +487 / -2 (`614c5c2`, `e663aae`) | +8 / -0 tests only (+6 committed `d70ca7a`, +2 uncommitted); `src/` untouched |
| Open findings at feature end | MAJOR AC-2.6 field (fixed by FV-1 in run 2), MINOR batch cap | MAJOR F-1 (B5), MINOR sprint-1 F-1 (B6 negative), NOTE F-2 |
| EST_TOKENS | ~87,900 (50,600 + 37,300) | **~110,900** (62,500 + 48,400) |
| Like-for-like (excl. agent defs) | ~87,900 | ~99,400 (+13%) |

Run 2 cost more while generating almost nothing, because it re-read everything run 1 produced
(verification mode) and its Monitor read two runs instead of one. The like-for-like +13% is the
price of a cross-run audit, not of the loop itself. Planner baseline also rose: `sprint-decomposition`
grew 1,508 → 1,917 w (FV-1 gate added), which is now ~530 tokens on every future Planner invocation.

## Quality trend notes
- **vs previous sprints:** Verdict, iterations, hard gates and weighted total (96) identical to run 1
  sprint 2 — but from **different failing checks and different denominators** (run 1: A 11/11,
  B 12/13 with B13 FAIL; run 2: A 10/10, B 11/12 with B5 FAIL). The equal total is coincidence, not
  agreement. DIM-B across live sprints 91 → 92; no leniency drift. Run 2 is consistently stricter
  than run 1 (sprint 1: 100 → 96), so run 1's scores now read as lenient.

- **Repeated finding #1 — Evaluator restating the Generator's per-case evidence (2 of 2 sprints).**
  Run 1 sprint 2 Evaluator recorded AC-2.3 as "asserts `error.code` and `error.details.field` per
  case" — the same words as run 1's Generator summary (line 14). It was false: cases (b) and (c)
  asserted `details` but not `error.code` (`git diff` shows exactly those 2 lines added in run 2),
  while the contract THEN clause requires `VALIDATION_ERROR` for each case. Correct result was
  AC-2.3 `PARTIAL` (non-business-rule portion) → B13 FAIL; B13 was already FAIL for AC-2.6, so no
  score moved — the error was hidden by luck. Sprint 1 (AC-1.7 case (c)) was the identical pattern.
  Two occurrences = missing rule. Run 2's Evaluator, working without `.harness/reviews/`, cited line
  numbers per AC and did not repeat it; the live Generator caught both in verification mode.

- **Repeated finding #2 — check-result-layer non-determinism (evaluator.agent.md Determinism
  property 2), now in both sprints.** Property 1 held every time (identical hashes); property 2 did
  not. Same tests, different results:
  | Sprint | Check | Run 1 | Run 2 | Cause |
  |---|---|---|---|---|
  | 1 | B6 | PASS | FAIL | "new event" = name vs emit site |
  | 2 | B5 | PASS (cited AC-2.4 only) | FAIL (AC-2.2, AC-2.3(b)) | "negative-path test" = only paths that reach the repository vs every rejection in the diff |
  | 2 | B6 | PASS | n/a | same B6 ambiguity; run 1 counted sprint 1's emits as in scope |
  | 2 | A6 | PASS | n/a | no n/a rule when the diff names no event; run 1 scored a vacuous PASS |
  | 2 | B13 | FAIL | PASS | legitimate — contract changed by FV-1, not a determinism defect |

  Run 2's Evaluator listed its readings and their score impact (worst case 86, still PASS). That
  disclosure is what made this analysable. Under property 2 these checks should have been
  `UNDETERMINED`; because they are not hard gates the score is the same, so the defect is in the
  criterion wording, not the Evaluator.

- **Skill file drift candidates (recommend only — no skill file edited):**
  1. **`.harness/skills/how-to-review/SKILL.md` §5 (Verifying acceptance criteria)** — highest
     priority (repeated #1). Rule: *for an AC whose THEN clause lists cases, the evidence column
     cites the `file:line` of the assertion for each case and each clause; wording copied from the
     Generator summary is not evidence.*
  2. **`.harness/skills/grading-criteria/SKILL.md` §2 B5** — define the term: *"A negative-path test
     is any test in the diff that expects a rejection (4xx, thrown error) or zero updates. PASS
     requires it to re-read a named entity or count afterwards, whether or not the rejection happens
     before the repository is reached."* Mirror in **`how-to-test/SKILL.md` §5** with a route-level
     example (GET after a 400). Planner side: **`sprint-decomposition/SKILL.md`** — every negative-path
     AC carries an "AND `<entity>` still reads `<state>`" clause. AC-2.4 had one and passed B5;
     AC-2.2/AC-2.3 lacked it, which is exactly where F-1 sits.
  3. **`grading-criteria/SKILL.md` §2 B6** — carried from sprint 1, now confirmed twice: define
     "new event" as *an `emit()` call added in the diff*, and state *n/a when the diff adds no
     `emit()`*. Mirror in `how-to-test` line 130 / checklist line 209.
  4. **`grading-criteria/SKILL.md` §2 A6 and B7** — A6: *n/a when the diff uses no event name*. B7:
     add *"in the diff"* (run 2 found pre-existing status-only tests; whole-file reading → 92).
  5. **`.harness/agents/evaluator.agent.md` Determinism section** — make run 2's "Readings applied"
     block mandatory whenever a check has two plausible readings, with both scores shown.

- **Routing gap — MAJOR under PASS.** F-1 is a MAJOR, open, and goes nowhere. `CLAUDE.md` §4 and
  `grading-criteria` §4 carry MAJORs forward only on CONDITIONAL PASS. A PASS archives and advances,
  and on the last sprint it "reports to the developer" without saying open findings must be listed.
  `grading-criteria` §7 even shows a B5 MAJOR under PASS being "carried as NOTEs". Sprint 1's
  MINOR (B6) has the same problem. Recommend `CLAUDE.md` §4 PASS row: *open MAJORs carry forward as
  in CONDITIONAL PASS; on the final sprint they are listed in the feature-done report as backlog.*
  F-1's fix is one GET plus one assertion and needs no production change.

- **Harness health / escalation proximity:** 2 sprints, 2 iterations, 0 escalations, 0 gate files
  touched (HG-A4 over `614c5c2..HEAD` + working tree), 0 contract deviations. No escalation trigger
  came close: no hard gate `UNDETERMINED`, no BLOCKER, no FAIL. The nearest verdict boundary was the
  Evaluator's worst-case reading (86, one point above PASS). The nearest escalation in either run was
  run 1 sprint 2's AC-2.6: if HG-B3 had been read strictly, it was a FAIL whose fix needed a contract
  change, which is an escalation trigger. FV-1 removed that path in run 2. Artefact hygiene: the
  +2 test lines are uncommitted at log time, and the Evaluator dates its feedback 2026-10-01 while
  this log is dated 2026-09-30. That is the same clock mismatch noted in sprint 1, still not fixed.

---
MONITOR: LOGGED
SPRINT: 2 of 2
VERDICT: PASS
ITERATIONS: 1
ESCALATION: NONE
EST_TOKENS: 48400
