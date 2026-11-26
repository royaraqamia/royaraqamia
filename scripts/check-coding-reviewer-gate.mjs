#!/usr/bin/env node
/**
 * The committed reviewer evidence check (ADR-0223).
 *
 * A reviewer may be switched on only by a recorded eval run. This script
 * recomputes the gate from the stored numbers, so an edited status or a weaker
 * record fails the pull request instead of reaching members.
 *
 *   node scripts/check-coding-reviewer-gate.mjs            # validate
 *   node scripts/check-coding-reviewer-gate.mjs --json     # machine-readable
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { gateProblems, gatePasses } from '../shared/contracts/coding-reviewer-gate.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const path = join(root, 'evals', 'coding', 'reviewer-gate.json');

function fail(message) {
  console.error(`check:coding-reviewer — ${message}`);
  process.exit(1);
}

let gate;
try {
  gate = JSON.parse(readFileSync(path, 'utf8'));
} catch (error) {
  fail(`cannot read evals/coding/reviewer-gate.json: ${error.message}`);
}

const problems = gateProblems(gate);
if (problems.length > 0) fail(problems.join('; '));

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ status: gate.status, enabled: gatePasses(gate) }));
  process.exit(0);
}

console.log(
  gatePasses(gate)
    ? `check:coding-reviewer — reviewer is ON (${gate.model}); evidence clears every threshold.`
    : 'check:coding-reviewer — reviewer is off; no recorded evidence enables it.'
);
