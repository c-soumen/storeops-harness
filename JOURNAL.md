# Architecture Journal — StoreOps Harness Build

A record of what actually happened while building this harness — the decisions I rejected, the
mistakes the harness caught before I did, and things I learned about Claude Code as a platform
that I did not know on Day 1. Personal log, not deliverable-report. Written across the build,
not reconstructed from memory.

## Corrections timeline

Seventeen corrections surfaced in this build. The first ten came from the baseline scaffold
generation (`.harness-notes/baseline-corrections.md`) and became input material for the skill
files. Seven happened *inside* the harness and are logged here. #11–#14 came from the
retrospective run. #15–#17 came from the live run on 2026-10-01 and are proposed, not yet
applied (see below for why).

### #11 — Field names in an AC must exist on the type

**Trigger.** Sprint 2, first Generator run: 231 of 232 tests passed. The failing one asserted
`breach.body` toContain `'act_restock_aisle4'`, but the `Notification` domain type puts the id
in `title`; `body` holds the reason.

**Diagnosis.** The Planner had written AC-2.6 as "a **body** naming `act_restock_aisle4`". A
Generator following the contract literally produced the wrong assertion. Blame is with the
contract, not the code. Sprint 1's AC-1.3 had the same shape — it referenced a `store_002`
fixture that does not exist and cannot be added (`tests/reports/service.test.ts` asserts exact
counts). Two occurrences of the same defect class in two sprints.

**Structural fix.** A new self-check in `sprint-decomposition/SKILL.md`: every field name an
AC asserts against must resolve on the actual domain type; every fixture id must exist. The
Planner now hard-fails a decomposition that names anything that is not there. Applied in commit
`22b7194`.

**Why it matters.** The alternative fix is a code fix — change `alerts` to move the id into
`body`. But `alerts` was out of contract scope for sprint 2, and the single-item PATCH path
depends on the current composition. Widening scope to make a contract accurate would have
broken working code to save a wrong AC. Routing the finding back to the Planner keeps every
agent honest to its own scope.

### #12 — Archive on run-end, not on PASS

**Trigger.** My own instruction to CLI: "run two sprints back to back and compare both
summaries."

**Diagnosis.** The original `CLAUDE.md` §8 archive rule said "on PASS, copy `.harness/output/`
to `.harness/reviews/`". But `.harness/output/generator-summary.md` is an **unqualified**
filename — sprint 2 overwrites it before the archive step runs, and every FAIL iteration would
have gone unarchived too. Two sprints back-to-back would have silently destroyed sprint 1's
record. The audit trail — the whole point of `.harness/reviews/` — was a leaky abstraction.

**Structural fix.** Archive fires at the *end of the Generator run*, whatever the verdict.
Failed iterations get `sprint-N-iteration-i-*` naming. Sprint N+1 cannot start until sprint N
is archived. Applied in commit `29111ec`, before the commit landed — I fixed the governance
layer while it was still being written.

**Why it matters most.** Every other correction is about the code being reviewed. This one is
about the review itself. A harness that silently loses evidence is worse than no harness.
Governance-of-governance is the layer that has to be right first.

### #13 — Split B3 / B13 in `grading-criteria`

**Trigger.** Applying my own grading skill to AC-2.6 in real time.

**Diagnosis.** The original B3 said "every AC is MET". Applied to AC-2.6, this collided with
`how-to-review` §5, which said `PARTIAL` only fails when the uncovered part is the business
rule. Two rules, contradictory verdicts on the same evidence. My own framework was ambiguous.

**Structural fix.** B3 (hard gate) asks "is the business rule proven?"; B13 (soft) asks "was
every clause verified?". A defective AC scores B3 PASS / B13 FAIL — MAJOR finding, verdict
still PASS, routed to the Planner. In `grading-criteria/SKILL.md` §2.

**Why it matters.** The single-rule versions each optimise for one thing at the cost of
another — punish the Generator for the Planner's imprecision, or ignore contract sloppiness
entirely. Splitting the concerns lets each failure land on the agent that can fix it. It also
means the grading system survived its own first real use, which was the least I hoped for.

### #14 — Findings must cite the check they fail

**Trigger.** Writing my own findings on sprint 1 and 2, I realised I had no rule for how
severity connects to score.

**Diagnosis.** `how-to-review` said a MAJOR causes a "dimension deduction", but the score is
`passed / applicable` over checks — severity has no arithmetic effect on its own. I could hand
out MAJORs that changed nothing, and BLOCKERs that failed nothing.

**Structural fix.** In `grading-criteria/SKILL.md`: **a MAJOR finding must cite the check it
fails.** If nothing fails, it is a MINOR or a NOTE — or the checklist is missing a check,
which is a Monitor signal for the next skill-file iteration. BLOCKERs still force FAIL
directly through the verdict table, independent of score.

**Why it matters.** The connection between narrative (findings) and arithmetic (score) has to
be explicit or one of them starts drifting. This rule keeps them coupled — a finding without a
failed check is a signal that the checklist itself needs to grow, not a hidden score penalty.

### #15 — Check wording must admit one reading

**Trigger.** The live run (run 2): fresh Evaluators with no access to `.harness/reviews/`. Sprint 1's
B6 came back FAIL where the retrospective had recorded PASS, on the same tests.

**Diagnosis.** B6 says "every new event". Run 1 read that as a new event *name*, run 2 as a new
`emit()` *site*. Sprint 2 repeated the pattern on B5 ("every negative-path test": run 1 cited
AC-2.4 only, run 2 applied it to every rejection), and on B6/A6, which have no n/a rule. Four
divergent check results over identical code. Verdicts matched only because the checks were soft
and the scores had headroom. `verdict.mjs` is deterministic, but its input is not.

**Proposed fix.** Define each term in `grading-criteria/SKILL.md` §2: "negative-path test",
"new event" (= `emit()` added in the diff), and the n/a conditions for A6, B6, and B7.
**Not applied in-run.** Changing a gate definition between the runs being compared would make the
comparison meaningless, and `CLAUDE.md` §4 makes gate edits a developer decision.

### #16 — The Evaluator restated the Generator's claims as evidence

**Trigger.** Both live Generators, working in verification mode, found missing assertions that run
1's Evaluator had recorded as present. AC-1.7 case (c) did not assert `details.field`. AC-2.3
cases (b) and (c) did not assert `error.code`. Fixed in `d70ca7a` and `0b12a90`.

**Diagnosis.** Run 1's AC-2.3 evidence uses the same words as its Generator summary. The Evaluator
verified the claim, not the code. This is the gap "one thing I would design differently" below
predicts before the live run had been done. The live run is the evidence.

**Proposed fix.** `how-to-review/SKILL.md` §5: for a THEN clause with cases, cite the `file:line`
of each case's assertion. Wording that matches the summary is not evidence. Run 2's Evaluator
cited lines per AC and did not repeat the error.

### #17 — A MAJOR under PASS has no route

**Trigger.** Live sprint 2 passed at 96 with an open MAJOR (B5, `tests/activities/routes.test.ts:242`)
on the final sprint.

**Diagnosis.** `CLAUDE.md` §4 carries MAJORs forward only on CONDITIONAL PASS. A PASS archives and
advances, so a MAJOR on the last sprint is recorded and then dropped.

**Proposed fix.** In the §4 PASS row, open MAJORs carry forward as they do under CONDITIONAL PASS.
On the final sprint, the feature-done report lists them as backlog.

## Decisions I rejected

Not every alternative was worth taking. Recording the paths not taken because the reasons
they were rejected are the reasons the current design holds.

- **One-sprint decomposition of the demo feature.** Tempting because it looks simpler on
  paper — one contract, one Generator run. Rejected because the hard part (partial-failure
  classification) and the transport layer (207 Multi-Status route) fail for different reasons
  and should be reviewed independently. A finding on classification should not trigger a
  re-review of the route.

- **Archive on PASS (kept the first draft, killed on Day 4–6).** Discussed under #12. What
  killed it in practice was writing the sentence "two back-to-back sprints will silently
  destroy sprint 1's record" and realising it was true.

- **LLM-only verdict computation.** Would have been easier to write, would have looked more
  "agentic". Rejected because the verdict is a table plus arithmetic, and asking an LLM to
  execute a table it could just run is where drift starts. The 175-line `verdict.mjs` is not
  clever; it is boring on purpose, and its output is verifiable with `diff`.

- **Adding a `store_002` activity to the seed data to close AC-1.3 cleanly.** Would have made
  the test simpler by one line. Rejected because `tests/reports/service.test.ts` asserts
  `activitiesByStore: { store_001: 3, store_002: 0 }` — extending the seed to fix one test
  would have broken another. Instead, AC-1.3 arranges the fixture in-test and the seeded
  counts stay stable. The reports test was the harness telling me "don't do that".

- **Bumping the batch cap to test the exact 50-id boundary.** Would have needed 50 seeded
  activities, would have broken every other reports assertion. Left flagged as a NOTE in
  sprint-1 evaluator feedback rather than fixed. Sometimes the honest answer is "we cannot
  test this without moving something more valuable, and we know we cannot".

## Claude Code as a platform — observations

Things I did not know on Day 1 that shaped how I would run the next capstone.

**Opus vs Sonnet cost trade-off.** I used Opus 5 (Enterprise) for everything, and it hit my
individual spend cap on Day 10. Sonnet would have done the mechanical work (baseline
generation, running gates, writing routine tests) at roughly 20% of the cost. The
architectural work — skill file design, evaluator dimensions, decision-brief writing — is
where Opus earns its price. Next time: default Sonnet, escalate to Opus explicitly. This would
have kept me under the cap and made the same output.

**OneDrive + jest worker interaction.** During baseline generation, the full jest run took
**79 minutes** with 12 ts-jest workers each type-checking on OneDrive-backed disk. Fixed by
moving type checking out of the transform (`isolatedModules: true`, `diagnostics: false`) and
setting `maxWorkers: '50%'` — down to 21 seconds. This is documented in
`.harness-notes/baseline-corrections.md` #7. Corporate-managed drives amplify small-file I/O
in ways local disks do not. The mitigation belongs in the `how-to-test` skill because it is
now StoreOps-specific institutional knowledge, not a generic tip.

**When the harness caught its own defect.** Correction #12 (the archive rule) is the moment I
knew the design was working. My instruction — "run two sprints and compare" — triggered a
governance defect the harness itself surfaced before it destroyed any evidence. I did not
notice it in my own writing; the pattern of what CLI was about to do exposed it. The lesson: a
harness that only tests the code being generated is doing half the job. It also has to test
itself under the operations it enables.

**CLI spend cap mid-run recovery.** When the cap hit on Day 10, I lost nothing. Everything was
already committed. `.harness/output/` files stayed on disk (gitignored, per spec). Ten commits
told the whole phase history. This was accidental — I did not design for interruption — but it
was possible because the harness treats every handoff as a file, not a conversation. An
agent that inherits nothing from the previous invocation cannot be broken by an interruption
between them. Files-not-conversation as a context-scoping strategy (`CLAUDE.md` §6) turned out
to also be an interruption-recovery strategy. That is a bonus, not a claim of foresight.

**Claude Code auto-discovery of CLAUDE.md is load-bearing.** Every fresh CLI session in the
repo reads `CLAUDE.md` before I type anything. The full context — orchestrator, agents,
skills, routing — restores from disk without me pasting anything. The desktop app session I
used to write these docs uses the same mechanism (memory files at
`.claude/projects/.../memory/`). Two different Claude environments, one recovery pattern.

## One thing I would design differently

The Evaluator runs after each Generator sprint, but there is **no reviewer of the Evaluator**
in this harness. Correction #13 (the B3/B13 ambiguity) was self-caught while I was writing the
feedback by hand — an actual Evaluator agent producing that feedback in a live loop would
have quietly resolved the ambiguity one way or the other, and the drift would only have
surfaced later in the Monitor's trend line. The harness has governance of the code (Evaluator)
and governance of the loop (Monitor) but no independent check on the governance itself.

A "meta-review" role — a second Evaluator agent that samples one in every N feedback files
against `grading-criteria`, looking for the same kind of internal contradiction the split
resolved — would close that gap. I would add it before the next feature rather than the next
capstone. Not a hard requirement to ship this one, but the honest limit of what the current
design catches.
