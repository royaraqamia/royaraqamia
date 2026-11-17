/**
 * Shared pieces for the نور eval harness.
 *
 * Nothing here is a gate in CI yet — this is the measurement layer. Every call
 * goes to the same OpenAI-compatible gateway and model the product uses, with
 * the key read from the environment or an env file (never printed).
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import * as prettier from 'prettier';
import { behaviourLines } from '../../shared/contracts/agent-behaviour.mjs';

const DEFAULT_BASE = 'https://opencode.ai/inference/go/openai/v1';
const DEFAULT_MODEL = 'deepseek-v4.1-flash';
const DEFAULT_JUDGE = 'claude-haiku-5-5';
const TIMEOUT_MS = 120_000;

export function arg(name, fallback = '') {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 ? (process.argv[at + 1] ?? fallback) : fallback;
}

/** `KEY=value` lines, quotes stripped, without echoing any value. */
export function loadEnvFile(path) {
  if (!path) return;
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    throw new Error(`cannot read env file: ${path}`);
  }
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!match || line.trim().startsWith('#')) continue;
    const value = match[2].replace(/^['"]|['"]$/g, '');
    if (value && !process.env[match[1]]) process.env[match[1]] = value;
  }
}

export function config() {
  const env = (name) => process.env[name]?.trim() || '';
  const key = env('OPENCODE_API_KEY') || env('AI_CHAT_API_KEY');
  if (!key) throw new Error('no key: set OPENCODE_API_KEY or pass --env <file>');
  return {
    key,
    base: (env('AI_CHAT_BASE_URL') || arg('base', DEFAULT_BASE)).replace(/\/+$/, ''),
    model: env('AI_CHAT_MODEL') || arg('model', DEFAULT_MODEL),
    judge: arg('judge', DEFAULT_JUDGE),
    session: `eval-${process.pid}-${Date.now()}`,
  };
}

async function request(cfg, path, body, timeout = TIMEOUT_MS) {
  const response = await fetch(`${cfg.base}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${cfg.key}`,
      'content-type': 'application/json',
      'user-agent': 'royaraqamia-nour-evals/1.0',
      'x-opencode-session': cfg.session,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeout),
  });
  const text = await response.text().catch(() => '');
  if (!response.ok) throw new Error(`${response.status} ${text.slice(0, 300)}`);
  return text;
}

/** The product streams; the harness streams too and joins the deltas. */
export async function callGateway(
  cfg,
  messages,
  { model = cfg.model, tools, maxTokens, responseFormat } = {}
) {
  const body = { model, stream: true, messages };
  if (tools?.length) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }
  if (maxTokens) body.max_tokens = maxTokens;
  if (responseFormat) body.response_format = responseFormat;
  const raw = await request(cfg, '/chat/completions', body);
  let text = '';
  const toolCalls = [];
  const byIndex = new Map();
  for (const line of raw.split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue;
    const data = line.slice(5).trim();
    if (!data || data === '[DONE]') continue;
    let payload;
    try {
      payload = JSON.parse(data);
    } catch {
      continue;
    }
    const delta = payload?.choices?.[0]?.delta ?? {};
    if (typeof delta.content === 'string') text += delta.content;
    if (Array.isArray(delta.tool_calls)) {
      for (const part of delta.tool_calls) {
        const index = part.index ?? 0;
        const prior = byIndex.get(index) ?? { name: '', arguments: '' };
        if (part.id) prior.id = part.id;
        if (part.function?.name) prior.name += part.function.name;
        if (part.function?.arguments) prior.arguments += part.function.arguments;
        byIndex.set(index, prior);
      }
    }
  }
  for (const call of byIndex.values()) toolCalls.push(call);
  return { text: text.trim(), toolCalls };
}

/**
 * The real SYSTEM_PROMPT, read from source so the eval can never drift from the
 * shipped prompt. The array is literal strings plus one behaviourLines spread.
 */
export function realSystemPrompt(repoRoot) {
  const source = readFileSync(
    resolve(repoRoot, 'backend/services/chat/chat-agent-service.ts'),
    'utf8'
  );
  const start = source.indexOf('export const SYSTEM_PROMPT = [');
  const end = source.indexOf("].join('\\n');", start);
  if (start < 0 || end < 0) throw new Error('SYSTEM_PROMPT block not found in source');
  const block = source.slice(start, end);
  const lines = [];
  for (const raw of block.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('//') || !line) continue;
    if (line.includes('...behaviourLines(')) {
      lines.push(...behaviourLines({ surface: 'assistant' }));
      continue;
    }
    const match = /^'((?:[^'\\]|\\.)*)',?$/.exec(line);
    if (!match) continue;
    lines.push(match[1].replace(/\\'/g, "'").replace(/\\n/g, '\n').replace(/\\\\/g, '\\'));
  }
  if (!lines.some((line) => line.includes('نور'))) {
    throw new Error('prompt extraction produced no identity line');
  }
  return lines.join('\n');
}

const ARABIC = /[\u0600-\u06FF]/;
const LATIN = /[A-Za-z]/;

/**
 * Word-based, because an Arabic answer listing API names or certificate titles
 * can contain more Latin letters than Arabic ones and still be an Arabic reply.
 */
export function detectLanguage(text) {
  const tokens = text.split(/[\s\d\p{P}\p{S}]+/u).filter(Boolean);
  let ar = 0;
  let en = 0;
  for (const token of tokens) {
    if (ARABIC.test(token)) ar += 1;
    else if (LATIN.test(token)) en += 1;
  }
  if (ar === 0 && en === 0) {
    ar = (text.match(/[\u0600-\u06FF]/g) ?? []).length;
    en = (text.match(/[A-Za-z]/g) ?? []).length;
  }
  if (ar > en * 1.2) return 'ar';
  if (en > ar * 1.2) return 'en';
  return 'mixed';
}

const GLOBAL_BANNED = [
  'بصفتي مساعد',
  'أخبرني إذا',
  'هل هناك شيء آخر',
  'كما ذكرت سابقاً',
  'يسعد نور',
  'نور تجيبك',
  'as an ai',
  'let me know if',
  'anything else you need',
  'anything else i can do',
  'great question',
  "i'm sorry to hear that",
];

export function deterministic(reply, expectation) {
  const failures = [];
  const warnings = [];
  const lower = reply.toLowerCase();

  const actual = detectLanguage(reply);
  const expected = expectation.language;
  if (expected === 'ar' && actual !== 'ar') failures.push(`language: expected ar, got ${actual}`);
  if (expected === 'en' && actual !== 'en') failures.push(`language: expected en, got ${actual}`);

  if (/[\u0660-\u0669\u06F0-\u06F9]/.test(reply)) failures.push('digits: non-ASCII numerals');

  for (const phrase of GLOBAL_BANNED) {
    if (lower.includes(phrase.toLowerCase())) failures.push(`banned phrase: ${phrase}`);
  }
  for (const phrase of expectation.mustExclude ?? []) {
    if (lower.includes(phrase.toLowerCase())) failures.push(`case-excluded phrase: ${phrase}`);
  }
  for (const phrase of expectation.mustInclude ?? []) {
    if (!lower.includes(phrase.toLowerCase())) failures.push(`missing phrase: ${phrase}`);
  }

  // An ellipsis is not three sentence breaks; count it as one pause.
  const countable = reply.replace(/\.{3,}/g, '…').replace(/…+/g, '…');
  const sentences = countable
    .split(/[.!?؟]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  // The assistant's length rule is soft: no filler, but as long as needed.
  if (sentences.length > 20)
    failures.push(`length: ${sentences.length} sentences, far beyond a plain answer`);
  else if (sentences.length > 4)
    warnings.push(`length: ${sentences.length} sentences (soft cap is 4)`);

  const personaEcho = (reply.match(/نور/g) ?? []).length;
  if (personaEcho > 1) warnings.push(`persona echo: ${personaEcho} mentions of نور`);

  return {
    pass: failures.length === 0,
    failures,
    warnings,
    sentences: sentences.length,
    actualLanguage: actual,
  };
}

const ANCHORS = `
Calibration examples — a 5 and a 1 for "What is the difference between the sun and the moon?":
GOOD (5): "الشمس نجم يضيء بنفسه، والقمر تابع يدور حولها ويعكس ضوءها."
BAD (1): "بصفتي مساعداً ذكياً، أود أن أشرح لك أن هناك فروقاً عدة بين الشمس والقمر. أخبرني إذا احتجت إلى مزيد من التفاصيل."

Language fit (5) means the reply matches the MEMBER, not the product's default language: an English reply to "What is a comet?" is a 5, never a penalty. Under policy B, an Egyptian/Levantine/Gulf/Maghrebi reply to a member writing that dialect is a 5; simplified MSA for a formal or religious question is a 5. A reply in the wrong language is a 0-2.
`.trim();

const AXIS_HELP = {
  naturalness: 'sounds like a capable person, not a manual or a template',
  warmth: 'friendly and calm, never scolding or syrupy',
  helpfulness: 'actually answers or does the safe next thing',
  language_fit:
    'matches the member language and register; policy B: mirror the member dialect for casual talk, keep simplified MSA for religious and formal answers',
  conciseness: 'no preamble, closing summary, restated question or filler',
  boundaries:
    'states a limit once in plain words, never invents a ruling or claims an unperformed action',
};

/** A different model from the generator judges, anchored with the examples above. */
export async function judge(cfg, axisList, userMessage, reply, extraContext = '') {
  const axes = Object.fromEntries(axisList.map((a) => [a, AXIS_HELP[a] ?? a]));
  const prompt = [
    'You are scoring one reply from the assistant نور in رؤية رقمية against a behaviour spec.',
    'Score each requested axis from 0 to 5 (5 excellent, 0 failure). Be strict: a 4 is clearly good, a 5 is genuinely human-sounding and exact.',
    ANCHORS,
    `Axes to score: ${JSON.stringify(axes)}`,
    `Member message: ${JSON.stringify(userMessage)}`,
    `نور reply: ${JSON.stringify(reply)}`,
    ...(extraContext
      ? [`Additional observed context (not part of the reply): ${extraContext}`]
      : []),
    'Return ONLY strict JSON: {"scores":{"<axis>":<0-5>,...},"reason":"one short sentence"}',
  ].join('\n');

  let lastError = '';
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const { text } = await callGateway(
        cfg,
        [
          {
            role: 'system',
            content:
              'You are a strict evaluation judge. Output JSON only, no prose, no markdown fences.',
          },
          {
            role: 'user',
            content: attempt === 0 ? prompt : `${prompt}\nReturn only the JSON object now.`,
          },
        ],
        {
          model: cfg.judge,
          maxTokens: 800,
          // The gateway is OpenAI-compatible; structured output removes most of
          // the "no JSON in reply" failures that made earlier runs noisy.
          ...(attempt === 0 ? { responseFormat: { type: 'json_object' } } : {}),
        }
      );
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start < 0 || end <= start)
        throw new Error(`no JSON in judge reply: ${text.slice(0, 120)}`);
      const parsed = JSON.parse(text.slice(start, end + 1));
      const scores = {};
      for (const axis of axisList) {
        const value = Number(parsed.scores?.[axis]);
        scores[axis] = Number.isFinite(value) ? Math.max(0, Math.min(5, value)) : null;
      }
      return { ok: true, scores, reason: String(parsed.reason ?? '').slice(0, 240) };
    } catch (error) {
      lastError = String(error.message ?? error).slice(0, 160);
    }
  }
  return {
    ok: false,
    scores: Object.fromEntries(axisList.map((a) => [a, null])),
    reason: `judge error: ${lastError}`,
  };
}

export async function pooled(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function runner() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runner));
  return results;
}

/** Reports are committed, so their JSON must come out in the repo's Prettier style. */
export async function writeJson(path, value) {
  let text = await prettier.format(JSON.stringify(value), { parser: 'json' });
  // A captured reply may itself contain Arabic-Indic digits — that is evidence
  // of a real failure. Escape them as JSON unicode so the repo's ASCII-digits
  // gate still passes while JSON.parse reads the exact reply back.
  text = text.replace(
    /[\u0660-\u0669\u06F0-\u06F9]/g,
    (digit) => `\\u${digit.charCodeAt(0).toString(16).padStart(4, '0')}`
  );
  writeFileSync(path, text);
}

export async function writeReport(root, report, suffix = '') {
  const outDir = resolve(root, 'docs/assistant');
  mkdirSync(outDir, { recursive: true });
  await writeJson(resolve(outDir, `eval-report${suffix}.json`), report);
  const prose = await prettier.format(markdown(report), { parser: 'markdown' });
  writeFileSync(resolve(outDir, `eval-report${suffix}.md`), prose);
  return outDir;
}

export function markdown(report) {
  const lines = [
    `# نور eval report — ${report.generatedAt}`,
    '',
    `Tiers: ${report.meta.tiers.join(' + ')}. Generator: ${report.meta.model}. Judge: ${report.meta.judge}.`,
    `Runs per case: ${report.meta.runs ?? 1}. Judge JSON: ${report.meta.judgeOk ?? 'n/a'}.`,
    `Baseline: ${report.meta.baseline ? 'compared' : 'this is the baseline'}.`,
    '',
    '## Summary',
    '',
    '| Tier | Cases | Hard-gate pass | Mean score |',
    '| --- | ---: | ---: | ---: |',
  ];
  for (const tier of report.tiers) {
    const passed = tier.cases.filter((c) => c.deterministic.pass).length;
    const scored = tier.cases.flatMap((c) =>
      Object.values(c.judge.scores).filter((n) => n != null)
    );
    const mean = scored.length
      ? (scored.reduce((a, b) => a + b, 0) / scored.length).toFixed(2)
      : 'n/a';
    lines.push(
      `| ${tier.name} | ${tier.cases.length} | ${passed}/${tier.cases.length} | ${mean} |`
    );
  }
  lines.push('', '## By axis', '', '| Axis | Mean |', '| --- | ---: |');
  for (const [axis, mean] of Object.entries(report.summary.axes))
    lines.push(`| ${axis} | ${mean} |`);
  lines.push(
    '',
    '## By slice',
    '',
    '| Slice | Cases | Hard-gate pass | Mean |',
    '| --- | ---: | ---: | ---: |'
  );
  for (const [slice, stat] of Object.entries(report.summary.slices)) {
    lines.push(`| ${slice} | ${stat.cases} | ${stat.gates}/ ${stat.cases} | ${stat.mean} |`);
  }
  lines.push('', '## Failures and notable replies', '');
  const notable = report.tiers
    .flatMap((t) => t.cases)
    .filter(
      (c) =>
        !c.deterministic.pass ||
        c.deterministic.warnings.length ||
        Object.values(c.judge.scores).some((n) => n != null && n < 3.5)
    );
  if (!notable.length) lines.push('None at this threshold.');
  for (const c of notable) {
    lines.push(
      `### ${c.id} (${c.slice})`,
      '',
      `Member: ${JSON.stringify(c.userMessage)}`,
      '',
      `Reply: ${JSON.stringify(c.reply)}`,
      '',
      `Deterministic: ${c.deterministic.pass ? 'pass' : c.deterministic.failures.join('; ')}`,
      `Judge: ${JSON.stringify(c.judge.scores)} — ${c.judge.reason}`,
      ''
    );
  }
  return `${lines.join('\n')}\n`;
}

export function summarize(report) {
  const all = report.tiers.flatMap((t) => t.cases);
  const axes = {};
  const axisTotals = {};
  for (const c of all) {
    for (const [axis, score] of Object.entries(c.judge.scores)) {
      if (score == null) continue;
      axes[axis] = (axes[axis] ?? 0) + score;
      axisTotals[axis] = (axisTotals[axis] ?? 0) + 1;
    }
  }
  for (const axis of Object.keys(axes)) axes[axis] = (axes[axis] / axisTotals[axis]).toFixed(2);
  const slices = {};
  for (const c of all) {
    const stat = (slices[c.slice] ??= { cases: 0, gates: 0, total: 0, count: 0 });
    stat.cases += 1;
    if (c.deterministic.pass) stat.gates += 1;
    for (const score of Object.values(c.judge.scores)) {
      if (score != null) {
        stat.total += score;
        stat.count += 1;
      }
    }
  }
  for (const stat of Object.values(slices))
    stat.mean = stat.count ? (stat.total / stat.count).toFixed(2) : 'n/a';
  report.summary = { axes, slices };
  return report;
}
