#!/usr/bin/env node
/**
 * Model-layer eval: the real نور system prompt + the real production gateway,
 * with simulated member messages. No product code is changed.
 *
 *   node scripts/nour-evals/run-model-layer.mjs --env D:\Projects\royaraqamia\.env
 *   node scripts/nour-evals/run-model-layer.mjs --env ... --limit 12 --concurrency 4
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  arg,
  callGateway,
  config,
  deterministic,
  judge,
  loadEnvFile,
  pooled,
  realSystemPrompt,
  summarize,
  writeReport,
} from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(arg('repo', resolve(here, '../..')));
loadEnvFile(arg('env'));

const cfg = config();
const suite = JSON.parse(readFileSync(resolve(here, 'suite.json'), 'utf8'));
const system = realSystemPrompt(root);
const limit = Number(arg('limit', '0')) || 0;
const concurrency = Number(arg('concurrency', '4')) || 4;

// A case that needs a real tool cannot be scored here: with no tools declared,
// the model sometimes emits a literal <tool_call> string instead of an answer.
// Those belong to the agent tier.
let cases = suite.model.filter((testCase) => !testCase.needsTool);
if (limit > 0) cases = cases.slice(0, limit);

process.stdout.write(
  `model layer: ${cases.length} case(s) · model ${cfg.model} · judge ${cfg.judge} · prompt ${system.length} chars\n`
);

const results = await pooled(cases, concurrency, async (testCase) => {
  const userMessage = testCase.messages[testCase.messages.length - 1]?.content ?? '';
  const messages = [{ role: 'system', content: system }, ...testCase.messages];
  let reply = '';
  let error = '';
  try {
    reply = (await callGateway(cfg, messages)).text;
  } catch (caught) {
    error = String(caught.message ?? caught).slice(0, 200);
  }
  const gate = deterministic(reply, testCase.expect);
  const verdict = await judge(
    cfg,
    testCase.expect.judge ?? ['naturalness', 'helpfulness'],
    userMessage,
    reply
  );
  return {
    id: testCase.id,
    slice: testCase.slice,
    topic: testCase.topic,
    userMessage,
    reply,
    error,
    deterministic: gate,
    judge: verdict,
  };
});

const report = summarize({
  generatedAt: new Date().toISOString(),
  meta: {
    tiers: ['model'],
    model: cfg.model,
    judge: cfg.judge,
    baseline: false,
    promptChars: system.length,
  },
  tiers: [{ name: 'model', cases: results }],
});
writeReport(root, report, '-model');

for (const result of results) {
  const scores = Object.entries(result.judge.scores)
    .map(([k, v]) => `${k}=${v ?? '?'}`)
    .join(' ');
  process.stdout.write(
    `${result.deterministic.pass ? 'PASS' : 'FAIL'} ${result.id.padEnd(20)} ${result.deterministic.actualLanguage.padEnd(5)} ${scores}${result.error ? ` ERROR ${result.error}` : ''}\n`
  );
}
process.stdout.write(`\nreport: ${resolve(root, 'docs/assistant/eval-report-model.md')}\n`);
