#!/usr/bin/env node
/**
 * Deterministic verdict calculator for the StoreOps harness Evaluator.
 *
 * Usage:  node .harness/bin/verdict.mjs .harness/output/sprint-N-checks.json
 *
 * Reads recorded check results and emits a canonical VERDICT BLOCK. The point is
 * that the arithmetic and the threshold comparison are executed rather than
 * interpreted: identical input JSON always yields byte-identical output, so
 * verdict determinism is verifiable with `diff` instead of being asserted.
 *
 * Implements grading-criteria/SKILL.md §1-§5. If you change a weight, a
 * threshold, or the rule order, change it there too — this file is the
 * executable copy of that table, not a second opinion.
 */

import { readFileSync } from 'node:fs';

const RESULTS = ['PASS', 'FAIL', 'UNDETERMINED', 'n/a'];

/** grading-criteria §3 — hard gates in their fixed order of application. */
const HARD_GATE_ORDER = [
  { gate: 'HG-A4', dimension: 'A', check: 'A11', type: 'automated' },
  { gate: 'HG-B1', dimension: 'B', check: 'B1', type: 'automated' },
  { gate: 'HG-A2', dimension: 'A', check: 'A2', type: 'automated' },
  { gate: 'HG-A1', dimension: 'A', check: 'A1', type: 'automated' },
  { gate: 'HG-B2', dimension: 'B', check: 'B2', type: 'automated' },
  { gate: 'HG-A3', dimension: 'A', check: 'A5', type: 'llm-assessed' },
  { gate: 'HG-B3', dimension: 'B', check: 'B3', type: 'llm-assessed' },
];

/** grading-criteria §1 — weights must sum to 100. */
const WEIGHTS = { A: 55, B: 45 };

const THRESHOLD_PASS = 85;
const THRESHOLD_CONDITIONAL = 70;

const fail = (message) => {
  console.error(`verdict.mjs: ${message}`);
  process.exit(2);
};

const inputPath = process.argv[2];
if (!inputPath) {
  fail('usage: node .harness/bin/verdict.mjs <checks.json>');
}

let input;
try {
  input = JSON.parse(readFileSync(inputPath, 'utf8'));
} catch (error) {
  fail(`cannot read ${inputPath}: ${error.message}`);
}

const weightSum = WEIGHTS.A + WEIGHTS.B;
if (weightSum !== 100) {
  fail(`dimension weights must sum to 100, got ${weightSum}`);
}

/** Score one dimension: 100 * passed / applicable. UNDETERMINED counts as fail. */
const scoreDimension = (checks) => {
  const ids = Object.keys(checks).sort((a, b) =>
    a.localeCompare(b, 'en', { numeric: true }),
  );
  let applicable = 0;
  let passed = 0;

  for (const id of ids) {
    const result = checks[id];
    if (!RESULTS.includes(result)) {
      fail(`check ${id} has invalid result '${result}' (expected one of ${RESULTS.join(', ')})`);
    }
    if (result === 'n/a') {
      continue;
    }
    applicable += 1;
    if (result === 'PASS') {
      passed += 1;
    }
  }

  if (applicable === 0) {
    fail('a dimension has zero applicable checks');
  }

  return { applicable, passed, score: Math.round((100 * passed) / applicable) };
};

const dimensions = input.dimensions ?? {};
for (const key of ['A', 'B']) {
  if (!dimensions[key] || typeof dimensions[key] !== 'object') {
    fail(`missing checks for dimension ${key}`);
  }
}

const dimA = scoreDimension(dimensions.A);
const dimB = scoreDimension(dimensions.B);
const total = Math.round((WEIGHTS.A * dimA.score + WEIGHTS.B * dimB.score) / 100);

/** Resolve each hard gate from its backing check, in fixed order. */
const allChecks = { ...dimensions.A, ...dimensions.B };
const gateRows = HARD_GATE_ORDER.map(({ gate, dimension, check, type }) => {
  const result = allChecks[check];
  if (result === undefined) {
    fail(`hard gate ${gate} references missing check ${check}`);
  }
  if (result === 'n/a') {
    fail(`hard gate ${gate} (check ${check}) cannot be n/a — a hard gate always applies`);
  }
  return { gate, dimension, check, type, result };
});

const findings = Array.isArray(input.findings) ? input.findings : [];
const blockers = findings.filter((f) => f.severity === 'BLOCKER');

const firstFailedGate = gateRows.find((row) => row.result === 'FAIL');
const firstUndeterminedGate = gateRows.find((row) => row.result === 'UNDETERMINED');

/** grading-criteria §5 — evaluated top to bottom, first match wins. */
let verdict;
let reason;
if (firstFailedGate) {
  verdict = 'FAIL';
  reason = `hard gate ${firstFailedGate.gate} (check ${firstFailedGate.check}) FAILED`;
} else if (firstUndeterminedGate) {
  verdict = 'ESCALATE';
  reason = `hard gate ${firstUndeterminedGate.gate} (check ${firstUndeterminedGate.check}) is UNDETERMINED — ambiguous evaluation`;
} else if (blockers.length > 0) {
  verdict = 'FAIL';
  reason = `${blockers.length} BLOCKER finding(s): ${blockers.map((f) => f.id).join(', ')}`;
} else if (total >= THRESHOLD_PASS) {
  verdict = 'PASS';
  reason = `all hard gates passed and weighted total ${total} >= ${THRESHOLD_PASS}`;
} else if (total >= THRESHOLD_CONDITIONAL) {
  verdict = 'CONDITIONAL PASS';
  reason = `all hard gates passed and weighted total ${total} is within ${THRESHOLD_CONDITIONAL}-${THRESHOLD_PASS - 1}`;
} else {
  verdict = 'FAIL';
  reason = `weighted total ${total} < ${THRESHOLD_CONDITIONAL}`;
}

const pad = (value, width) => String(value).padEnd(width);
const out = [];

out.push('--- VERDICT BLOCK (generated by .harness/bin/verdict.mjs) ---');
out.push(`SPRINT: ${input.sprint ?? '?'}`);
out.push(`ITERATION: ${input.iteration ?? '?'}`);
out.push('');
out.push('Hard gates, in order of application:');
out.push('| # | Gate | Dim | Check | Type | Result |');
out.push('|---|---|---|---|---|---|');
gateRows.forEach((row, index) => {
  out.push(
    `| ${index + 1} | ${pad(row.gate, 5)} | ${row.dimension} | ${pad(row.check, 3)} | ${pad(row.type, 12)} | ${row.result} |`,
  );
});
out.push('');
out.push('Dimension scores:');
out.push('| Dim | Dimension | Weight | Passed/Applicable | Score |');
out.push('|---|---|---|---|---|');
out.push(
  `| A | Architecture compliance | ${WEIGHTS.A}% | ${dimA.passed}/${dimA.applicable} | ${dimA.score} |`,
);
out.push(
  `| B | Contract fulfilment and test substance | ${WEIGHTS.B}% | ${dimB.passed}/${dimB.applicable} | ${dimB.score} |`,
);
out.push('');
out.push(`WEIGHTED TOTAL: ${total}`);
out.push(`BLOCKER FINDINGS: ${blockers.length}`);
out.push(`DECISION RULE: ${reason}`);
out.push('');
out.push(`VERDICT: ${verdict}`);
out.push('--- END VERDICT BLOCK ---');

console.log(out.join('\n'));
