/**
 * One message in, one answer out.
 *
 * The order matters and is deliberate: transcribe, understand, answer, publish,
 * record. Every branch either answers the owner or says why it could not, so a
 * message can never end in silence - which is the failure that looks like a dead
 * bot and says nothing in the log.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import { DEFAULT_TZ_MINUTES, MODEL, TRANSCRIBE_MODELS, workflowRunUrl } from './config.mjs';
import { runAgent, agentWorkdir } from './agent.mjs';
import { agentEnvironment, installGuards } from './guards.mjs';
import { askModel, db, telegram } from './http.mjs';
import { announcePull, hasChanges, publishWork } from './publish.mjs';
import {
  buildSystemPrompt,
  buildUserMessage,
  EMPTY_ANSWER,
  STATUS_THINKING,
  failureId,
  failureLine,
} from './prompt.mjs';
import { createReporter, sendMarkdown } from './progress.mjs';
import {
  contextFor,
  ensureChat,
  forgetMemory,
  memoriesFor,
  patchMessage,
  recordOutbound,
} from './store.mjs';
import { formatOffset, languageOf } from './text.mjs';

/** Telegram's OGG/OPUS to 16 kHz mono WAV, when the runner has ffmpeg. */
export function toWav(input) {
  try {
    return execFileSync(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        'pipe:0',
        '-ar',
        '16000',
        '-ac',
        '1',
        '-f',
        'wav',
        'pipe:1',
      ],
      { input, maxBuffer: 40_000_000 }
    );
  } catch {
    return null;
  }
}

function permanent(message) {
  const error = new Error(message);
  error.permanent = true;
  return error;
}

/**
 * Turns a voice note into text.
 *
 * Cheapest model first, and a failure steps over instead of ending the attempt:
 * `gemini-4-argon` answered 503 twice in a row, so it is tried last.
 */
export async function transcribe(fileId, { botToken }) {
  const file = await telegram('getFile', { file_id: fileId });
  if (!file?.file_path) throw permanent('Telegram returned no file path for this voice note');

  const audio = await fetch(`https://api.telegram.org/file/bot${botToken}/${file.file_path}`);
  if (!audio.ok) {
    const detail = `${audio.status} (${file.file_path})`;
    throw audio.status === 404
      ? permanent(`لم يعد Telegram يوفّر هذا الملف الصوتي: ${detail}`)
      : new Error(`downloading the voice note failed: ${detail}`);
  }

  const ogg = Buffer.from(await audio.arrayBuffer());
  const wav = toWav(ogg);
  const candidates = [
    ...(wav ? [{ data: wav.toString('base64'), format: 'wav' }] : []),
    { data: ogg.toString('base64'), format: 'ogg' },
  ];

  let lastError;
  for (const model of TRANSCRIBE_MODELS) {
    for (const candidate of candidates) {
      try {
        const message = await askModel(
          [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: [
                    'حوّل هذا الصوت إلى نص عربي حرفياً كما قيل.',
                    'لا تلخّص، لا تصحّح، لا تضف كلمات لم تُسمع.',
                    'إن كانت كلمة غير واضحة فاكتب [غير واضح] بدل تخمينها.',
                    'إن لم تسمع صوتاً فاكتب: صمت.',
                  ].join(' '),
                },
                { type: 'input_audio', input_audio: candidate },
              ],
            },
          ],
          { model }
        );

        const text = String(message.content ?? message.audio_transcript ?? '').trim();
        if (text) return text;
      } catch (error) {
        lastError = error;
      }
    }
  }

  throw new Error(
    `الصوت لم يُفرَّغ${lastError ? ` (${String(lastError.message).slice(0, 120)})` : ''}`
  );
}

async function downloadTelegramFile(fileId, suffix, botToken) {
  const file = await telegram('getFile', { file_id: fileId });
  if (!file?.file_path) return null;

  const response = await fetch(`https://api.telegram.org/file/bot${botToken}/${file.file_path}`);
  if (!response.ok) return null;

  const dir = '/tmp/telegram-attachments';
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${suffix}-${basename(file.file_path)}`);
  writeFileSync(path, Buffer.from(await response.arrayBuffer()));
  return path;
}

/** The owner's own words for "forget that one". Deliberately narrow. */
export function parseForget(text) {
  const source = String(text ?? '').trim();
  if (source.length > 80) return null;
  const match =
    /^(?:احذف|امسح|delete|forget)\s+(?:الذكرى|الذاكرة|memory)?\s*(?:رقم|#|number)?\s*(\d{1,6})$/i.exec(
      source
    );
  return match ? Number(match[1]) : null;
}

/**
 * Memory deletion runs here, not through the agent.
 *
 * The agent has a shell and a database connection; "delete row 7" as a sentence
 * is one prompt injection away from being a DELETE the owner did not mean. The
 * narrow parser above is the whole grammar it accepts.
 */
async function forgetIfAsked(text, chatId) {
  const id = parseForget(text);
  if (!id) return false;

  const known = await memoriesFor(chatId);
  const exists = known.some((row) => Number(row.id) === id);
  const line = exists
    ? `حذفت الذكرى رقم ${id}.`
    : `لا توجد ذكرى بالرقم ${id}. قل «ماذا تتذكر عني؟» لترى الأرقام الحالية.`;

  await sendMarkdown(chatId, line);
  await recordOutbound({ chatId, body: line });
  return true;
}

/** Cancellation is a column, so a tap reaches a run that is already working. */
function canceller(rowId) {
  let cache = { value: false, at: 0 };
  return async () => {
    if (Date.now() - cache.at < 4_000) return cache.value;
    const rows = await db(`telegram_messages?id=eq.${rowId}&select=cancel_requested`);
    cache = { value: Boolean(rows?.[0]?.cancel_requested), at: Date.now() };
    return cache.value;
  };
}

function gitHead(cwd) {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function resetWorktree(cwd, sha) {
  if (!sha) return;
  try {
    execFileSync('git', ['checkout', '--detach', sha], { cwd, stdio: 'ignore' });
    execFileSync('git', ['clean', '-fd', '--', '.'], { cwd, stdio: 'ignore' });
  } catch {
    // A reset that fails is logged by the caller's next step; it must not turn
    // a delivered answer into an error.
  }
}

/**
 * Answers one stored message.
 *
 * Returns a small result object rather than throwing: the caller decides what a
 * failure means, and `failureLine` is the only thing allowed to speak to the
 * owner about it.
 */
export async function answerMessage({ row, cwd = agentWorkdir(), botToken }) {
  const chatId = row.chat_id;
  const chat = await ensureChat(chatId, null);
  const offset = chat.tz_offset_minutes ?? DEFAULT_TZ_MINUTES;
  const tz = { offsetMinutes: offset, formatted: formatOffset(offset) };
  const runUrl = workflowRunUrl();

  let text = String(row.body ?? '').trim();

  if (row.voice_file_id) {
    const transcript = await transcribe(row.voice_file_id, { botToken });
    text = `${text && !text.startsWith('🎙️') ? `${text}\n` : ''}${transcript}`.trim();
    await patchMessage(row.id, { body: text });
  }

  if (!text) {
    const line = 'وصلتني الرسالة بلا نص. اكتبها أو أرفق صورة مع وصف قصير.';
    await sendMarkdown(chatId, line);
    await recordOutbound({ chatId, body: line });
    return { ok: false, reason: 'empty' };
  }

  if (await forgetIfAsked(text, chatId)) return { ok: true, handled: 'memory' };

  const attachments = [];
  if (row.photo_file_id) {
    const path = await downloadTelegramFile(row.photo_file_id, `photo-${row.id}`, botToken);
    if (path) attachments.push({ kind: 'صورة', path });
  }
  if (row.document_file_id) {
    const path = await downloadTelegramFile(row.document_file_id, `file-${row.id}`, botToken);
    if (path) attachments.push({ kind: 'ملف', path });
  }

  const context = await contextFor(chatId, row.id);
  const isCancelled = canceller(row.id);
  const reporter = createReporter({
    chatId,
    messageRowId: row.id,
    onLog: (line) => process.stdout.write(`telegram: ${line}\n`),
  });

  await reporter.start(STATUS_THINKING);

  const head = gitHead(cwd);
  // The shims are the guarantee; the prompt is the explanation. Created per
  // message so the PATH the agent inherits is the guarded one and nothing else.
  const guardedPath = installGuards({
    dir: `/tmp/telegram-guards-${row.id}`,
    log: (line) => process.stdout.write(`telegram: ${line}\n`),
  });

  let result;
  try {
    result = await runAgent({
      prompt: buildUserMessage({ text, context, attachments }),
      cwd,
      model: MODEL,
      files: attachments.map((item) => item.path),
      env: agentEnvironment({ guardedPath }),
      onProgress: (line) => {
        void reporter.update(line);
      },
      shouldStop: isCancelled,
      onLog: (line) => process.stdout.write(`telegram: ${line}\n`),
      // The prompt is the system message; `run` has no separate flag for it, so
      // the instructions travel first in the same message.
      preamble: buildSystemPrompt({ tz, runUrl, language: languageOf(text) }),
    });
  } finally {
    await reporter.close();
  }

  if (result.killed === 'cancelled') {
    const line = 'أوقفت العمل كما طلبت. لا شيء تغيّر في المستودع.';
    await sendMarkdown(chatId, line);
    await recordOutbound({ chatId, body: line });
    return { ok: true, handled: 'cancelled' };
  }

  if (result.killed === 'timeout') {
    const id = failureId(`${row.id}:timeout`);
    const line = failureLine(id);
    await sendMarkdown(chatId, line);
    await recordOutbound({ chatId, body: line });
    return { ok: false, reason: 'timeout', reference: id };
  }

  const answer = result.answer;
  if (!answer) {
    const line =
      result.exitCode === 0 ? EMPTY_ANSWER : failureLine(failureId(`${row.id}:${result.exitCode}`));
    await sendMarkdown(chatId, line);
    await recordOutbound({ chatId, body: line });
    return { ok: false, reason: 'empty-answer' };
  }

  const sent = await sendMarkdown(chatId, answer);
  await recordOutbound({
    chatId,
    body: answer,
    repo: null,
    runUrl,
    telegramMessageId: sent[0]?.messageId ?? null,
  });

  // Files changed: the record, the branch and the pull request are code, and the
  // merge waits for two taps.
  if (hasChanges(cwd)) {
    // Publishing is reported, never retried: the answer already reached the
    // owner, and a retry would run the turn again and could open a second pull
    // request for one sentence.
    try {
      const published = await publishWork({
        cwd,
        messageRowId: row.id,
        requestText: text,
        answer,
        runUrl,
      });
      const announced = await announcePull({
        chatId,
        messageRowId: row.id,
        pull: published.pull,
        issue: published.issue,
      });
      await recordOutbound({
        chatId,
        body: announced.text,
        repo: null,
        runUrl,
        telegramMessageId: announced.telegramMessageId ?? null,
      });
      return { ok: true, handled: 'published', pull: published.pull.number };
    } catch (error) {
      const reference = failureId(`${row.id}:publish:${error?.message ?? ''}`);
      const line = `غيّرت الملفات لكن تعذّر فتح طلب الدمج (المرجع \`${reference}\`). التغييرات في الشجرة وحدها، ولم يُنشأ فرع.`;
      process.stdout.write(`telegram: publish failed: ${String(error?.message).slice(0, 300)}\n`);
      await sendMarkdown(chatId, line).catch(() => {});
      await recordOutbound({ chatId, body: line }).catch(() => {});
      return { ok: true, handled: 'publish-failed', reference };
    } finally {
      resetWorktree(cwd, head);
    }
  }

  return { ok: true, handled: 'answered' };
}
