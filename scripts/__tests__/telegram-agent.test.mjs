import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { runAgent } from '../telegram/agent.mjs';

/**
 * The agent is a child process, so this file tests the child-process seam: the
 * JSON lines it reads, and the fact that a stop request ends it.
 *
 * A fake binary stands in for `opencode run`, which keeps the test offline and
 * makes the event shapes explicit. It is skipped on Windows because the fake is
 * a shebang script, which Windows cannot execute directly; CI is Linux.
 */

const POSIX = process.platform !== 'win32';

function fakeAgent(lines, { sleepMs = 0 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'fake-agent-'));
  const path = join(dir, 'opencode');
  writeFileSync(
    path,
    [
      '#!/usr/bin/env node',
      'const lines = ' + JSON.stringify(lines) + ';',
      'for (const line of lines) {',
      '  process.stdout.write(`${JSON.stringify(line)}\\n`);',
      '}',
      sleepMs ? `await new Promise((resolve) => setTimeout(resolve, ${sleepMs}));` : '',
      'process.exit(0);',
    ].join('\n')
  );
  chmodSync(path, 0o755);
  return path;
}

const text = (value, messageID = 'msg_1') => ({
  type: 'text',
  part: { type: 'text', text: value, messageID },
});

const tool = (name, input = {}) => ({
  type: 'tool_use',
  part: { type: 'tool', tool: name, state: { status: 'running', input } },
});

describe.skipIf(!POSIX)('runAgent', () => {
  it('returns the last message text, not the working noise before a tool call', async () => {
    const binary = fakeAgent([
      { type: 'step_start' },
      text('سأقرأ الملف.', 'msg_1'),
      tool('read', { path: 'a/config.mjs' }),
      { type: 'step_finish' },
      { type: 'step_start' },
      text('الجواب النهائي.', 'msg_2'),
    ]);

    const progress = [];
    const result = await runAgent({
      prompt: 'اقرأ الملف',
      cwd: tmpdir(),
      env: { ...process.env, OPENCODE_BIN: binary },
      onProgress: (line) => progress.push(line),
    });

    expect(result.answer).toBe('الجواب النهائي.');
    expect(result.exitCode).toBe(0);
    expect(progress).toContain('أقرأ config.mjs…');
  });

  it('ends the run when the stop flag is set', async () => {
    const binary = fakeAgent([{ type: 'step_start' }], { sleepMs: 30_000 });

    const started = Date.now();
    const result = await runAgent({
      prompt: 'اقرأ المستودع كله',
      cwd: tmpdir(),
      pollIntervalMs: 50,
      shouldStop: () => true,
      env: { ...process.env, OPENCODE_BIN: binary },
    });

    expect(result.killed).toBe('cancelled');
    expect(Date.now() - started).toBeLessThan(20_000);
  });

  it('reports a failed spawn instead of throwing', async () => {
    const result = await runAgent({
      prompt: 'x',
      cwd: tmpdir(),
      env: { ...process.env, OPENCODE_BIN: join(tmpdir(), 'does-not-exist-opencode') },
    });
    expect(result.exitCode).toBe(-1);
    expect(result.answer).toBe('');
  });
});

describe('the fake binary itself', () => {
  it('is executable on this platform', () => {
    if (!POSIX) return;
    const binary = fakeAgent([text('ok')]);
    const output = execFileSync(binary, [], { encoding: 'utf8' });
    expect(output).toContain('"ok"');
  });
});
