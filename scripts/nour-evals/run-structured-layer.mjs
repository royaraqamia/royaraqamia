#!/usr/bin/env node
/**
 * Prototype layer for issue #1721: intent-conditioned prompt + structured reply
 * envelope + deterministic renderer, measured on the same model-layer suite as
 * the shipped prompt. Production is not switched over; this is the gate.
 *
 *   node scripts/nour-evals/run-structured-layer.mjs --env ... --runs 3
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
  summarize,
  writeReport,
} from './lib.mjs';
import {
  detectIntent,
  renderReply,
  voiceSystemPrompt,
} from '../../shared/contracts/nour-voice.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(arg('repo', resolve(here, '../..')));
loadEnvFile(arg('env'));

const cfg = config();
const suite = JSON.parse(readFileSync(resolve(here, 'suite.json'), 'utf8'));
const limit = Number(arg('limit', '0')) || 0;
const concurrency = Number(arg('concurrency', '4')) || 4;
const runs = Math.max(1, Number(arg('runs', '1')) || 1);

let cases = suite.model.filter((testCase) => !testCase.needsTool);
if (limit > 0) cases = cases.slice(0, limit);

process.stdout.write(
  `structured layer: ${cases.length} case(s) x ${runs} run(s) · model ${cfg.model} · judge ${cfg.judge}\n`
);

const allRuns = [];
for (let run = 0; run < runs; run += 1) {
  allRuns.push(
    await pooled(cases, concurrency, async (testCase) => {
      const userMessage = testCase.messages[testCase.messages.length - 1]?.content ?? '';
      const intent = detectIntent(userMessage);
      const system = voiceSystemPrompt(userMessage, { structured: true });
      const messages = [{ role: 'system', content: system }, ...testCase.messages];
      let rawReply = '';
      let error = '';
      let latencyMs = 0;
      let usage = null;
      let parsed = false;
      const started = Date.now();
      try {
        const result = await callGateway(cfg, messages, {
          responseFormat: { type: 'json_object' },
        });
        rawReply = result.text;
        usage = result.usage;
        const rendered = renderReply(rawReply, { intent });
        parsed = rendered.parsed;
      } catch (caught) {
        error = String(caught.message ?? caught).slice(0, 200);
      }
      latencyMs = Date.now() - started;
      const reply = parsed || rawReply ? renderReply(rawReply, { intent }).text : '';
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
        intent,
        reply,
        rawReply,
        parsed,
        promptChars: system.length,
        latencyMs,
        usage,
        error,
        deterministic: gate,
        judge: verdict,
      };
    })
  );
  process.stdout.write(`  run ${run + 1}/${runs} done\n`);
}

const meanOf = (values, digits = 2) => {
  const numbers = values.filter((value) => Number.isFinite(value));
  return numbers.length
    ? Number((numbers.reduce((a, b) => a + b, 0) / numbers.length).toFixed(digits))
    : null;
};
const mean = (values) => meanOf(values);
const percentile = (values, fraction) => {
  const numbers = values.filter(Number.isFinite).sort((a, b) => a - b);
  return numbers.length
    ? numbers[Math.min(numbers.length - 1, Math.floor(fraction * numbers.length))]
    : null;
};
const allEntries = allRuns.flat();
const promptTokens = allEntries.map((entry) => Number(entry.usage?.prompt_tokens));
const completionTokens = allEntries.map((entry) => Number(entry.usage?.completion_tokens));
const costs = allEntries.map((entry) =>
  Number(entry.usage?.opencode?.list_cost ?? entry.usage?.cost)
);

const results =
  runs === 1
    ? allRuns[0]
    : cases.map((testCase, index) => {
        const entries = allRuns.map((run) => run[index]);
        const axisList = testCase.expect.judge ?? ['naturalness', 'helpfulness'];
        const scores = {};
        for (const axis of axisList) {
          const values = entries
            .map((entry) => entry.judge.scores[axis])
            .filter((value) => typeof value === 'number');
          scores[axis] = values.length
            ? Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2))
            : null;
        }
        const ok = entries.filter((entry) => entry.judge.ok).length;
        return {
          id: testCase.id,
          slice: testCase.slice,
          topic: testCase.topic,
          intent: entries[0].intent,
          userMessage: testCase.messages.at(-1)?.content ?? '',
          reply: entries[0].reply,
          rawReply: entries[0].rawReply,
          parsed: entries.filter((entry) => entry.parsed).length === runs,
          error: entries
            .filter((entry) => entry.error)
            .map((entry) => entry.error)
            .join(' | '),
          deterministic: {
            pass: entries.every((entry) => entry.deterministic.pass),
            failures: [...new Set(entries.flatMap((entry) => entry.deterministic.failures))],
            warnings: [...new Set(entries.flatMap((entry) => entry.deterministic.warnings))],
            sentences: entries[0].deterministic.sentences,
            actualLanguage: entries[0].deterministic.actualLanguage,
          },
          judge: {
            ok: ok === runs,
            scores,
            reason: `mean of ${runs} runs (${ok}/${runs} judge calls returned JSON)`,
          },
          runs: entries.map((entry) => ({
            reply: entry.reply,
            intent: entry.intent,
            parsed: entry.parsed,
            latencyMs: entry.latencyMs,
            usage: entry.usage,
            deterministic: entry.deterministic,
            judge: entry.judge,
          })),
        };
      });

const judgeCalls = results.length * runs;
const judgeOk = results.reduce(
  (total, result) =>
    total + (result.runs?.filter((entry) => entry.judge.ok).length ?? (result.judge.ok ? 1 : 0)),
  0
);
const report = summarize({
  generatedAt: new Date().toISOString(),
  meta: {
    tiers: ['model'],
    model: cfg.model,
    judge: cfg.judge,
    baseline: false,
    prototype: 'structured-voice',
    runs,
    judgeOk: `${judgeOk}/${judgeCalls}`,
    promptChars: mean(allEntries.map((entry) => entry.promptChars)),
    latencyMs: {
      mean: mean(allEntries.map((entry) => entry.latencyMs)),
      p95: percentile(
        allEntries.map((entry) => entry.latencyMs),
        0.95
      ),
    },
    tokens: {
      prompt: mean(promptTokens),
      completion: mean(completionTokens),
    },
    cost: meanOf(costs, 8),
    envelopeParsed: `${allEntries.filter((entry) => entry.parsed).length}/${allEntries.length}`,
  },
  tiers: [{ name: 'model', cases: results }],
});
await writeReport(root, report, '-structured');

for (const result of results) {
  const scores = Object.entries(result.judge.scores)
    .map(([key, value]) => `${key}=${value ?? '?'}`)
    .join(' ');
  process.stdout.write(
    `${result.deterministic.pass ? 'PASS' : 'FAIL'} ${result.id.padEnd(20)} ${result.intent.padEnd(10)} ${scores}${result.parsed ? '' : ' PLAIN'}\n`
  );
}
process.stdout.write(`\nreport: ${resolve(root, 'docs/assistant/eval-report-structured.md')}\n`);
