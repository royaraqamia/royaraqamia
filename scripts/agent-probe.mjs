#!/usr/bin/env node
/**
 * Measures the assistant's gateway before the app depends on it.
 *
 * The Telegram bridge only ever asks for a non-streaming answer, while the
 * product's assistant needs three things the bridge never exercises: streamed
 * text, streamed tool calls, and image input. A gateway that answers the first
 * and fails the other two is indistinguishable from a working one until a member
 * presses send, so this probe asks each separately and prints the raw status.
 *
 * Nothing is written and no chat is touched: the checks are single calls with a
 * synthetic image and a silent one-second tone, exactly like the bridge's own
 * `probe` mode.
 *
 * Usage:
 *   node scripts/agent-probe.mjs
 *   node scripts/agent-probe.mjs --env D:\Projects\royaraqamia\.env.local
 *   node scripts/agent-probe.mjs --only stream,tools
 *   node scripts/agent-probe.mjs --base https://opencode.ai/inference/go/openai/v1 --model deepseek-v4.1-flash
 *
 * Key: OPENCODE_API_KEY (falls back to AI_CHAT_API_KEY), read from the
 * environment or the env file. The key is never printed.
 */

import { readFileSync } from 'node:fs';
import { silenceWav } from './telegram-bridge.mjs';

const DEFAULT_BASE = 'https://opencode.ai/inference/go/openai/v1';
const DEFAULT_MODEL = 'deepseek-v4.1-flash';
const AUDIO_MODELS = ['mimo-v2.6-flash', 'gemini-4-argon'];
const TIMEOUT_MS = 90_000;

/** A 1x1 PNG, which is enough to prove the gateway accepts an image part. */
const TINY_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function arg(name) {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 ? process.argv[at + 1] : '';
}

/** `KEY=value` lines, quotes stripped. The file is git-ignored, never committed. */
function loadEnvFile(path) {
  if (!path) return;
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    process.stdout.write(`probe env: cannot read ${path}\n`);
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!match || line.trim().startsWith('#')) continue;
    const value = match[2].replace(/^['"]|['"]$/g, '');
    if (value && !process.env[match[1]]) process.env[match[1]] = value;
  }
}

const env = (name) => process.env[name]?.trim() || '';

const base = (arg('base') || env('AI_CHAT_BASE_URL') || DEFAULT_BASE).replace(/\/+$/, '');
const model = arg('model') || env('AI_CHAT_MODEL') || DEFAULT_MODEL;
const only = arg('only')
  .split(',')
  .map((name) => name.trim())
  .filter(Boolean);

const wanted = (name) => only.length === 0 || only.includes(name);

function apiKey() {
  return env('OPENCODE_API_KEY') || env('AI_CHAT_API_KEY');
}

/** The gateway answers 400 MissingSessionID without this, and 401 with a bad key. */
function headers(key) {
  return {
    authorization: `Bearer ${key}`,
    'content-type': 'application/json',
    'user-agent': 'royaraqamia-agent-probe/1.0',
    'x-opencode-session': 'probe',
  };
}

async function call(key, body) {
  const started = Date.now();
  const response = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: headers(key),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await response.text().catch(() => '');
  return { status: response.status, ok: response.ok, text, ms: Date.now() - started };
}

/** Counts SSE frames and keeps what a reader would have seen. */
function readFrames(raw) {
  const lines = raw.split(/\r?\n/).filter((line) => line.startsWith('data:'));
  let text = '';
  let calls = 0;
  let sawDone = false;
  for (const line of lines) {
    const data = line.slice('data:'.length).trim();
    if (data === '[DONE]') {
      sawDone = true;
      continue;
    }
    if (!data) continue;
    let payload;
    try {
      payload = JSON.parse(data);
    } catch {
      continue;
    }
    const delta = payload?.choices?.[0]?.delta ?? {};
    if (typeof delta.content === 'string') text += delta.content;
    if (Array.isArray(delta.tool_calls)) calls += delta.tool_calls.length;
  }
  return { frames: lines.length, text, calls, sawDone };
}

const report = (name, verdict, detail) =>
  process.stdout.write(`probe ${name}: ${verdict} — ${detail}\n`);

async function probeModels(key) {
  const response = await fetch(`${base}/models`, {
    headers: headers(key),
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  if (!response) return report('models', 'unreachable', 'the list endpoint did not answer');
  const body = await response.text().catch(() => '');
  const ids = [];
  try {
    for (const row of JSON.parse(body)?.data ?? []) if (row?.id) ids.push(row.id);
  } catch {
    // Not JSON: the status is the whole answer.
  }
  report(
    'models',
    `${response.status}`,
    ids.length ? ids.slice(0, 40).join(', ') : body.slice(0, 300) || '(empty)'
  );
}

async function probeText(key) {
  const result = await call(key, {
    model,
    messages: [{ role: 'user', content: 'اكتب كلمة واحدة: تم.' }],
  });
  if (!result.ok) return report('text', `${result.status}`, result.text.slice(0, 400));
  const answer = JSON.parse(result.text)?.choices?.[0]?.message?.content ?? '';
  report(
    'text',
    `${result.status} in ${result.ms}ms`,
    String(answer).slice(0, 120) || '(no content)'
  );
}

async function probeStream(key) {
  const result = await call(key, {
    model,
    stream: true,
    messages: [{ role: 'user', content: 'اكتب جملة من ثلاث كلمات عن الصباح.' }],
  });
  if (!result.ok) return report('stream', `${result.status}`, result.text.slice(0, 400));
  const frames = readFrames(result.text);
  const verdict = frames.text.trim() ? `${result.status} in ${result.ms}ms` : 'EMPTY';
  report(
    'stream',
    verdict,
    `${frames.frames} frame(s), ${frames.text.length} char(s), done=${frames.sawDone}`
  );
}

async function probeTools(key) {
  const result = await call(key, {
    model,
    stream: true,
    tool_choice: 'auto',
    tools: [
      {
        type: 'function',
        function: {
          name: 'ping',
          description: 'أعد الكلمة pong. استخدمها دائماً قبل أي إجابة.',
          parameters: { type: 'object', properties: {}, additionalProperties: false },
        },
      },
    ],
    messages: [{ role: 'user', content: 'نادِ الأداة ping الآن، ثم قل تم.' }],
  });
  if (!result.ok) return report('tools', `${result.status}`, result.text.slice(0, 400));
  const frames = readFrames(result.text);
  const verdict = frames.calls > 0 ? `${result.status} in ${result.ms}ms` : 'NO CALL';
  report('tools', verdict, `${frames.calls} tool fragment(s), text=${frames.text.length} char(s)`);
}

async function probeImage(key) {
  const result = await call(key, {
    model,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'صف هذه الصورة في كلمتين.' },
          {
            type: 'image_url',
            image_url: { url: `data:image/png;base64,${TINY_PNG}` },
          },
        ],
      },
    ],
  });
  if (!result.ok) return report('image', `${result.status}`, result.text.slice(0, 400));
  const answer = JSON.parse(result.text)?.choices?.[0]?.message?.content ?? '';
  report(
    'image',
    `${result.status} in ${result.ms}ms`,
    String(answer).slice(0, 120) || '(no content)'
  );
}

async function probeAudio(key) {
  const data = silenceWav(1).toString('base64');
  for (const audioModel of AUDIO_MODELS) {
    const result = await call(key, {
      model: audioModel,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'اكتب أي كلمة تسمعها، أو اكتب: صمت.' },
            { type: 'input_audio', input_audio: { data, format: 'wav' } },
          ],
        },
      ],
    });
    if (!result.ok) {
      report('audio', `${audioModel} ${result.status}`, result.text.slice(0, 300));
      continue;
    }
    const answer = JSON.parse(result.text)?.choices?.[0]?.message?.content ?? '';
    report(
      'audio',
      `${audioModel} ${result.status} in ${result.ms}ms`,
      String(answer).slice(0, 120)
    );
    return;
  }
}

async function probeSpeech(key) {
  const response = await fetch(`${base}/audio/speech`, {
    method: 'POST',
    headers: headers(key),
    body: JSON.stringify({ model: arg('tts') || 'tts-1', input: 'اختبار', voice: 'alloy' }),
    signal: AbortSignal.timeout(30_000),
  }).catch(() => null);
  if (!response) return report('speech', 'unreachable', 'the speech endpoint did not answer');
  const detail = await response.text().catch(() => '');
  report(
    'speech',
    `${response.status}`,
    response.ok ? `${detail.length} byte(s) of audio` : detail.slice(0, 300)
  );
}

async function main() {
  loadEnvFile(arg('env'));

  const key = apiKey();
  if (!key) {
    process.stdout.write(
      'probe: no key. Set OPENCODE_API_KEY, pass --env <file>, or put it in .env.local.\n'
    );
    process.exitCode = 1;
    return;
  }

  process.stdout.write(`probe target: ${base} · model ${model}\n`);

  const checks = {
    models: probeModels,
    text: probeText,
    stream: probeStream,
    tools: probeTools,
    image: probeImage,
    audio: probeAudio,
    speech: probeSpeech,
  };

  for (const [name, check] of Object.entries(checks)) {
    if (!wanted(name)) continue;
    try {
      await check(key);
    } catch (error) {
      report(name, 'FAILED', String(error?.message ?? error).slice(0, 300));
      process.exitCode = 1;
    }
  }
}

main();
