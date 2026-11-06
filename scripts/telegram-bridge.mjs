#!/usr/bin/env node
/**
 * The Telegram bot's entry point.
 *
 * What it is: the owner's phone, wired to an agent that has the repository, the
 * skills, the database and the web. A message is answered by `opencode run`
 * inside this workflow, so "can you read the repo?" has one honest answer -
 * yes - and work it does arrives as a pull request that only two taps can merge
 * (ADR 0129, which supersedes ADR 0121's dispatcher).
 *
 * Why the webhook and not polling: a poll pays its interval whether or not
 * anybody wrote anything. Telegram pushes each update to the Supabase Edge
 * Function, which stores it and dispatches this workflow; runs scale with
 * messages instead of with the clock.
 *
 * Why a message is stored before it is handled: a dispatch can fail. The row is
 * the backstop - `drain` finds it, and `update_id` is unique so Telegram's own
 * retry cannot answer twice.
 *
 * Modes (the workflow's `mode` input):
 *   drain     answer what the webhook stored
 *   remind    deliver due reminders
 *   digest    report what the owner has not been told yet
 *   alerts    report a red check, once per window
 *   remember  distil the conversation into summary + facts
 *   probe     measure the transcription endpoint
 *   merge     complete a confirmed merge (a button, never a sentence)
 */

import { pathToFileURL } from 'node:url';

import { alerts, digest, drain, probe, remember, remind } from './telegram/jobs.mjs';
import { mergeConfirmed } from './telegram/merge.mjs';
import { recordOutbound } from './telegram/store.mjs';
import { sendMarkdown } from './telegram/progress.mjs';

export {
  chunkMarkdown,
  escapeHtml,
  formatOffset,
  languageOf,
  parseMemory,
  parseOffset,
  parseWhen,
  renderAnswer,
  stripHtml,
  toLatinDigits,
  withPartNumbers,
} from './telegram/text.mjs';
export { formatContext, formatHistory, formatMemories } from './telegram/store.mjs';
export { formatAlert, formatDigest, pullState, unseen, silenceWav } from './telegram/jobs.mjs';

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function runMerge(confirmationId) {
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!confirmationId) throw new Error('--confirmation is required for merge');

  const result = await mergeConfirmed({
    confirmationId,
    onLog: (line) => process.stdout.write(`telegram: ${line}\n`),
  });

  if (!chat) return result;

  const lines = {
    merged: `✅ دُمج [#${result.pull?.number}](${result.pull?.html_url}) في main، وحُذف الفرع.`,
    already: `[#${result.pull?.number}](${result.pull?.html_url}) مدموج بالفعل، لا شيء لفعله.`,
    expired: 'انتهت صلاحية ذلك التأكيد، ولم يُدمج شيء. اطلب الدمج من جديد.',
    unconfirmed: 'لم يكتمل التأكيد الثاني، ولم يُدمج شيء.',
    closed: 'طلب الدمج لم يعد مفتوحاً، فلا شيء لدمجه.',
    missing: 'لم أجد طلب الدمج المذكور، أو أنه حُذف.',
    failed: 'رفض GitHub الدمج. راجع صفحة الطلب، وسأحاول إن أردت.',
    unknown: 'هذا الزر لم يعد مرتبطاً بطلب دمج معروف.',
    kind: 'هذا التأكيد ليس لدمج.',
  };

  const text = result.ok
    ? result.already
      ? lines.already
      : lines.merged
    : (lines[result.reason] ?? lines.failed);

  await sendMarkdown(chat, text);
  await recordOutbound({ chatId: chat, body: text }).catch(() => {});
  return result;
}

async function main() {
  const mode = process.argv[2];

  if (mode === 'drain') return drain();
  if (mode === 'remind') return remind();
  if (mode === 'remember') return remember();
  if (mode === 'probe') return probe();
  if (mode === 'merge') return runMerge(arg('confirmation'));
  if (mode === 'digest') {
    return digest({
      workflow: arg('workflow') ?? 'Issue Planner',
      url: arg('url'),
      runId: arg('run-id') ? Number(arg('run-id')) : undefined,
    });
  }
  if (mode === 'alerts') {
    return alerts({
      workflow: arg('workflow') ?? 'Release Health',
      conclusion: arg('conclusion') ?? 'failure',
      url: arg('url'),
    });
  }

  throw new Error(`Unknown mode: ${mode}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
