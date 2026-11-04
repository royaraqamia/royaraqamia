/**
 * The agent: one `opencode run` per message, read as a stream.
 *
 * Why a process and not a chat completion: the completion the bridge used to
 * make had no tools and no repository, so "can you read the repo?" could only be
 * answered with a guess. A run has the checkout, the skills, the Supabase MCP
 * server and a shell. The price is that it is slow, which is why the status
 * message exists and why nothing here is capped at ninety seconds: the owner
 * asked for the answer to be as good as it can be, however long that takes.
 *
 * The stream is `--format json`, one event per line. Only two events matter for
 * progress (`tool_use` and `text`), and the answer is the text of the *last*
 * assistant message: text from a step that then called a tool is working noise,
 * not an answer.
 */

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

import { MODEL } from './config.mjs';

const MAX_CAPTURED_TEXT = 200_000;

/** What the owner reads while a tool runs, in their own language. */
export function progressLine(part) {
  if (!part || part.type !== 'tool') return '';
  const tool = String(part.tool ?? '');
  const input = part.state?.input ?? {};
  const file = typeof input.path === 'string' ? input.path.split('/').pop() : '';

  if (tool === 'read' && file) return `أقرأ ${file}…`;
  if ((tool === 'edit' || tool === 'write' || tool === 'patch') && file) return `أعدّل ${file}…`;
  if (tool === 'grep' || tool === 'glob' || tool === 'search') return 'أبحث في المستودع…';
  if (tool === 'bash') {
    const command = String(input.command ?? '')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .join(' ');
    return command ? `أشغّل ${command}…` : 'أشغّل أمراً…';
  }
  if (tool === 'webfetch' || tool === 'fetch') {
    try {
      return `أفتح ${new URL(String(input.url ?? '')).host}…`;
    } catch {
      return 'أفتح صفحة…';
    }
  }
  if (tool === 'skill') return `أطبّق مهارة ${String(input.id ?? '')}…`.replace('  ', ' ');
  if (tool === 'task') return 'أوزّع العمل على مساعد…';
  if (tool.startsWith('mcp') && tool.includes('supabase')) return 'أستعلم من قاعدة البيانات…';
  if (tool.startsWith('mcp') && tool.includes('vercel')) return 'أتحقق من Vercel…';
  return `أعمل على ${tool || 'الخطوة'}…`;
}

/** `part.tool` and `state.status` in a form a log can read. */
export function describeEvent(event) {
  if (event?.type === 'tool_use') {
    return `${event.part?.tool ?? 'tool'}:${event.part?.state?.status ?? '?'}`;
  }
  return String(event?.type ?? '');
}

/**
 * Runs the agent to completion.
 *
 * `onProgress` receives a short Arabic line; `shouldStop` is polled while the
 * process runs, because a button the owner tapped should end the run rather than
 * wait for a step to finish. Both are best-effort: neither can throw into the
 * caller and turn a good answer into an error.
 */
export async function runAgent({
  prompt,
  preamble = '',
  files = [],
  cwd,
  model = MODEL,
  timeoutMs = 45 * 60_000,
  pollIntervalMs = 5_000,
  onProgress = () => {},
  shouldStop = () => false,
  onLog = () => {},
  env = process.env,
}) {
  const binary = env.OPENCODE_BIN || 'opencode';
  // `run` has no system-message flag, so the instructions travel first in the
  // same message, fenced apart from the conversation they describe.
  const message = preamble ? `${preamble}\n\n---\n\n${prompt}` : prompt;
  const attachments = files.flatMap((file) => ['--file', file]);
  const args = [
    'run',
    '--standalone',
    '--format',
    'json',
    '--model',
    model,
    '--auto',
    ...attachments,
    message,
  ];

  const started = Date.now();
  const child = spawn(binary, args, {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    // A shell wrapper would hide the exit code; the binary is a direct spawn.
    shell: false,
  });

  const texts = new Map();
  let buffer = '';
  let stderr = '';
  let killed = '';
  let lastProgress = '';

  const stopWatcher = setInterval(() => {
    if (killed) return;
    // `shouldStop` may be a database read, so it is awaited rather than assumed
    // synchronous; a rejected read is a reason to keep working, not to stop.
    Promise.resolve()
      .then(() => shouldStop())
      .then((stop) => {
        if (!stop || killed) return;
        killed = 'cancelled';
        child.kill('SIGTERM');
        setTimeout(() => child.kill('SIGKILL'), 10_000).unref();
      })
      .catch(() => {});
  }, pollIntervalMs);

  const timer = setTimeout(() => {
    if (killed) return;
    killed = 'timeout';
    child.kill('SIGTERM');
    setTimeout(() => child.kill('SIGKILL'), 10_000).unref();
  }, timeoutMs);

  const progress = (line) => {
    if (!line || line === lastProgress) return;
    lastProgress = line;
    try {
      onProgress(line);
    } catch (error) {
      onLog(`progress hook failed: ${error.message}`);
    }
  };

  const handleLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let event;
    try {
      event = JSON.parse(trimmed);
    } catch {
      // A stray line that is not JSON is worth keeping in the log, nothing more.
      onLog(`agent (raw): ${trimmed.slice(0, 200)}`);
      return;
    }

    if (event.type === 'tool_use') {
      progress(progressLine(event.part));
      if (event.part?.state?.status === 'error') {
        onLog(
          `tool failed: ${event.part?.tool} ${String(event.part?.state?.error ?? '').slice(0, 200)}`
        );
      }
      return;
    }

    if (event.type === 'text' && event.part?.text) {
      const id = event.part.messageID ?? 'assistant';
      const current = texts.get(id) ?? '';
      if (current.length < MAX_CAPTURED_TEXT) {
        texts.set(id, `${current}${event.part.text}`);
      }
    }
  };

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    let newline = buffer.indexOf('\n');
    while (newline >= 0) {
      handleLine(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf('\n');
    }
  });

  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
    if (stderr.length > 20_000) stderr = stderr.slice(-20_000);
  });

  const exitCode = await new Promise((resolve) => {
    child.on('error', (error) => {
      onLog(`agent spawn failed: ${error.message}`);
      resolve(-1);
    });
    child.on('close', (code) => resolve(code ?? 0));
  });

  clearInterval(stopWatcher);
  clearTimeout(timer);
  if (buffer.trim()) handleLine(buffer);

  const answers = [...texts.values()];
  const answer = (answers.length ? answers[answers.length - 1] : '').trim();
  const elapsed = Date.now() - started;

  onLog(
    `agent finished in ${Math.round(elapsed / 1000)}s (exit ${exitCode}${killed ? `, ${killed}` : ''})`
  );

  return {
    answer,
    exitCode,
    killed,
    elapsedMs: elapsed,
    stderr,
    sessionId: randomUUID(),
  };
}

/**
 * The agent needs a working directory with the repository in it, and a writable
 * one when it has to run something. The workflow checks the repository out at the
 * job's root; `cwd` defaults to it.
 */
export function agentWorkdir(fallback = process.cwd()) {
  return process.env.GITHUB_WORKSPACE || fallback;
}
