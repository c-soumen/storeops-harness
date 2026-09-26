# Skill: how-to-review

**Purpose.** The review discipline: what order to apply checks in, how to read a diff against
R1–R6, how to write feedback a Generator can act on without guessing, and how to keep a verdict
reproducible. Scoring lives in `grading-criteria`; this file is about *how you look*.

**Read by:** evaluator.

---

## 1. The prime directive

**You verify. You do not trust, and you do not fix.**

The Generator's `generator-summary.md` is a claim, not evidence. A row marked ✅ means "the
Generator believes this"; your job is to confirm it against the code and the test output. Never
mark a check PASS because the summary says so.

You also never edit `src/`, `tests/`, or any config. If a gate is wrong, that is an escalation, not
a repair. The moment an Evaluator starts fixing code, it has no independent view of it.

## 2. Order of operations — fixed, non-negotiable

Always in this order. The order matters because early steps short-circuit later ones, and a
consistent order is half of verdict reproducibility.

1. **Re-run the automated gates yourself.** Do not read the Generator's `GATES:` line and believe
   it. Run all four:
   - `npx tsc --noEmit`
   - `npx eslint .`
   - `npx jest --coverage`
   - `npx jest tests/shared/architecture.test.ts`
2. **Compare your results to the Generator's `GATES:` line.** A mismatch is itself a finding
   (`GATE-MISMATCH`) — it means the summary was written before the last code change, and every
   other claim in it is now suspect.
3. **Apply hard gates** in the order listed in `grading-criteria` §3. Any hard-gate failure ends
   the review: verdict is FAIL, and you record the remaining checks as `NOT_ASSESSED`. Do not
   score dimensions on a hard-gate failure — a partial score invites negotiation about a gate that
   is not negotiable.
4. **Read the diff**, file by file, in dependency order: `types.ts` → `repository.ts` →
   `service.ts` → `routes.ts` → tests.
5. **Walk R1–R6** against the diff (§4).
6. **Verify each acceptance criterion** against its named test (§5).
7. **Score the dimensions** per `grading-criteria`.
8. **Compute the verdict** using the rule table — never by impression.
9. **Write `evaluator-feedback.md`**, findings ordered most-severe first.

Use `git diff <baseline>..HEAD -- src tests` or `git show <sha>` to get the sprint's diff. Review
the diff, not the whole file — but read enough surrounding context to judge whether the change
fits the file's existing idiom.

## 3. What counts as evidence

| Claim | Acceptable evidence | Not acceptable |
|---|---|---|
| A gate passes | Your own command output, this run | The Generator's `GATES:` line |
| An AC is met | A named test whose assertions cover the AC's full THEN clause, and the test passes | A test with a matching name; a coverage percentage |
| An event is emitted | A test asserting the emission **or** the observable downstream effect | An `emit()` call visible in the diff |
| State is unchanged on failure | An assertion reading the entity back, or a count | Absence of a mutation in the diff |
| A rule is not violated | The automated check that covers it, plus your own read of the diff | "The summary says R1 is satisfied" |

A test that exists but asserts less than its AC states is a **finding**, not a pass. This is the
single most common real defect: the test name matches the criterion, the assertions do not.

## 4. Reading the diff against R1–R6

For each rule: what to grep for, then what to read.

**R1 Module boundary.** `architecture.test.ts` covers the automated case. Additionally grep the
diff for `from '../<module>/repository'`. Then read: does any new cross-module read go through a
service, and is it injected rather than imported as a singleton inside a method?

**R2 Event bus only.** Grep for `import { alertService`, `import { reportService`,
`import { staffService` outside `src/app.ts`. Then read: is every cross-module *effect* an
`emit()`? Is every new event name declared in `shared/events/events.types.ts`? Is any new
subscriber registered anywhere other than `src/app.ts`? A feature that made a sibling module react
**without modifying it** is R2 working; call that out as a strength, because it is the evidence
failure mode 4 is closed.

**R3 Error contract.** ESLint covers raw `throw new Error` in services and routes. Your added
value is **subclass correctness**: missing entity → `NotFoundError` (not 400), cross-store access
→ `ForbiddenError` (not 404), duplicate → `ConflictError` (not 400). Also check every
`ValidationError` carries `{ field }`, and that no route hand-builds an error body with
`res.status(4xx).json({ error: … })`.

**R4 Layer separation.** Read each changed file against its layer's remit in
`architecture-principles` §R4. Specifically: business rules or authorization decisions in a route;
`req`/`res`/status codes in a service; a repository that validates, emits, or calls a service.
Shape validation in a route is correct and must not be reported as a violation.

**R5 Read-only reports.** Only relevant if `reports` is in the diff. Grep for
`this.activities.`/`this.programmes.`/`this.staff.` followed by `create|update|delete`.

**R6 Test substance.** For every new test: does it assert beyond the status code? Does the
negative path assert state is unchanged? Are there both positive and negative assertions for new
events? Coverage numbers are a floor, not evidence — read the assertions.

## 5. Verifying acceptance criteria

For each AC in the contract:

1. Find the test named in its **Verified by** line. Missing or renamed → finding `AC-UNVERIFIED`.
2. Read the AC's THEN clause and decompose it into every `AND`-joined assertion.
3. Confirm each sub-assertion appears in the test. Partially covered → `AC-PARTIAL`, which is a
   dimension deduction, and a hard-gate failure if the uncovered part is the business rule itself.
4. Confirm the test actually ran and passed in your own `jest` output.

Record one row per AC: `MET` / `PARTIAL` / `UNMET` / `NOT_ASSESSED`. These four values only.

## 6. Writing feedback the Generator can act on

Every finding gets: severity, rule or AC reference, **file and line**, what is wrong, and what
"correct" looks like. No finding without a location.

```markdown
### F-1 — [BLOCKER] R3 error contract — wrong subclass
**File:** src/activities/service.ts:214
**Check:** DIM-A/R3-2
**Observed:** A missing activity in the bulk path throws `ValidationError`.
**Required:** A missing entity is `NotFoundError` (404). `ValidationError` reports
malformed input, not absent state — the client cannot distinguish the two.
**Fix:** Replace with `new NotFoundError('Activity', id)`.
```

Severities, and what each does to the verdict:

| Severity | Meaning | Verdict effect |
|---|---|---|
| **BLOCKER** | Hard-gate failure, R1–R5 violation, or an AC's business rule unverified | FAIL |
| **MAJOR** | Real defect that does not breach a hard gate: `AC-PARTIAL`, a weak assertion, wrong-but-not-breaking subclass | Dimension deduction; may reach FAIL by score |
| **MINOR** | Convention drift, naming, comment density, a gap worth noting | Deduction only |
| **NOTE** | Observation or a strength worth recording | No effect |

Rules for feedback prose:

- **Name the rule or check id.** "This violates R2" is actionable; "this feels wrong" is not.
- **Quote the smallest offending fragment**, not the whole function.
- **Do not prescribe a refactor** beyond what the finding requires. Scope creep in feedback
  produces scope creep in the next iteration.
- **Do not repeat the Generator's own known gaps as findings** unless you disagree with its
  assessment — acknowledge them in the *Known-gap adjudication* section and say whether each is
  acceptable. The Generator flagged them honestly; converting them into findings punishes honesty
  and teaches the next run to hide them.
- **Record strengths** as NOTEs. The Monitor uses them for quality-trend detection, and a review
  that only ever emits criticism gives the trend line no signal.

## 7. Reproducibility discipline

The same check results must always produce the same verdict. Four habits enforce that:

1. **Fixed order** (§2), every time.
2. **Binary checks.** Every check in `grading-criteria` has explicit pass/fail criteria. If you
   find yourself weighing "how bad is this", you are scoring, not checking — record the binary
   result and let the weight do the work.
3. **Verdict by table, never by feel.** The verdict is computed from hard-gate outcomes plus the
   weighted score, using `grading-criteria` §5. It is executed by
   `node .harness/bin/verdict.mjs` so the arithmetic and the threshold comparison cannot drift
   between runs.
4. **`UNDETERMINED` is a real answer.** If a check cannot be decided from the artefacts, record
   `UNDETERMINED` — do not guess. Handling: an `UNDETERMINED` non-hard check counts as **fail** for
   scoring; an `UNDETERMINED` hard gate triggers **escalation**, not a verdict. Guessing is what
   makes two runs of the same review disagree.

## 8. Handling LLM output variability

Generated code varies run to run even under an identical contract. Convert variability into binary
results rather than judging the variation:

| Variable thing | What you do **not** do | What you check instead |
|---|---|---|
| Helper/variable naming | Prefer your own naming | Does it match the conventions in `coding-conventions`? Binary |
| Where a helper lives | Relocate it | Is it in the correct **layer**? Binary |
| Number of tests | Require a count | Does every AC have a test covering its full THEN? Binary per AC |
| Error message wording | Rewrite it | Is the subclass right and does `ValidationError` carry `{ field }`? Binary |
| Implementation approach | Compare to your preferred design | Does it pass the gates and satisfy R1–R6? Binary |

An implementation you would have written differently is **not** a finding. Only a rule breach, an
unverified criterion, or a convention breach is.

## 9. Review self-check before writing a verdict

- [ ] All four gates re-run by me, this run, after the last code change
- [ ] Generator `GATES:` line compared to my results
- [ ] Hard gates applied in `grading-criteria` §3 order
- [ ] Every changed file read, in dependency order
- [ ] R1–R6 each explicitly assessed (or `n/a` with a reason)
- [ ] Every AC has a row with one of the four allowed values
- [ ] Every finding has severity + rule/check id + file:line
- [ ] Generator's known gaps adjudicated, not silently re-reported
- [ ] Verdict produced by `verdict.mjs`, not by impression
- [ ] No file outside `.harness/output/` and `.harness/reviews/` modified by me
