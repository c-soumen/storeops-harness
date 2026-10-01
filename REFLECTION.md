# Reflection — what the live run showed about operating the harness

**What it did well.** The verdicts reproduced: PASS/PASS in both sprints, and `verdict.mjs` gave
byte-identical output on every input. Correction #11 moved the AC-2.6 defect from a failing test at
Generator time to a contract fix at planning time. `src/alerts/**` stayed untouched across both
runs and still alerted correctly. Running fresh, file-only agents also caught two false-MET claims
the retrospective review had accepted (`live-vs-retrospective.md`).

**Where it fell short.** `JOURNAL.md` already covers the design-level gap: nobody reviews the
Evaluator, confirmed by correction #16. This note is about an operational gap. The harness cannot
see its own running cost, and it believes it can.

## The limitation: the cost signal is guessed, and it is ~4.5× low

`CLAUDE.md` §6 calls skill-file depth a "deliberate trade": ~1,000–1,500 words per skill, paid on
every invocation. `monitor.agent.md` makes the run log's token estimate the place "where its price
shows up". The Monitor computes it as word count × 1.3 over the artefacts each agent read and
wrote. It states "no meter is available".

The live run had a meter. Claude Code reports actual usage for every subagent invocation:

| | Generator 1 | Evaluator 1 | Monitor 1 | Generator 2 | Evaluator 2 | Monitor 2 | Total |
|---|---|---|---|---|---|---|---|
| Actual tokens | 69.5k | 80.8k | 62.6k | 72.8k | 87.4k | 67.4k | **440k** |
| Wall-clock | 703s | 551s | 235s | 545s | 908s | 219s | **53 min** |

The Monitor's estimate for the same six invocations was **~97.5k**. The method counts what an agent
*reads on purpose*: skills, contract, diff. It misses what an agent *reads because it ran
something*: jest and coverage output, `git diff` and `git show`, curl bodies, re-reads, and the
reasoning between tool calls. That unseen share is about three-quarters of the cost. It also
explains the 53 minutes it took to verify an eight-line diff.

This matters because the estimate drives decisions. The archive implies a sprint costs ~50k
tokens and that skill files dominate it. In fact the expensive part is gate execution and evidence
gathering, which is invisible in the log. A trend line built on this number would miss an
Evaluator that starts re-running the suite twice.

## The improvement: meter, then report. Don't estimate.

1. **The orchestrator records actuals.** It writes one line per invocation to
   `.harness/output/run-metrics.jsonl`, using the figures Claude Code already returns when a
   subagent finishes: `{agent, sprint, iteration, tokens, duration_ms, tool_uses}`. The file is
   archived with the sprint's other artefacts, on the same archive-on-run-end trigger (D-1).
2. **The Monitor reads actuals.** EST_TOKENS becomes TOKENS, and the word-count method is kept as
   a breakdown of *where* the cost went, alongside the measured total.
3. **One new trend check.** If tokens per changed line, or Evaluator duration, more than doubles
   against the previous sprint, the Monitor raises a NOTE. That is a cheap early warning that an
   agent is looping on tool calls, which a verdict will never show.

## Connection to §D

This is **D-2** applied to a second number. D-2 took the verdict away from the LLM because
"asking an LLM to compute this is asking it to interpret a table it could just execute". The
token count was left as an LLM-authored estimate in the Monitor's prose, so it drifted exactly as
D-2 predicts. The verdict was off by zero; the cost was off by 4.5×. The rule D-2 implies is
broader than verdicts: **any number the harness can measure should be measured by code and
reported by the agent, never derived by the agent.** I would apply it next to coverage figures,
test counts, and iteration counts in the run log, which today are also transcribed by an LLM.
