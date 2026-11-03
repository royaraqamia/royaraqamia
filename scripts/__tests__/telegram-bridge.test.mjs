import { describe, expect, it } from 'vitest';

import {
  chunkMessage,
  commandSpan,
  formatAlert,
  formatDigest,
  formatHistory,
  formatOffset,
  parseCommand,
  parseOffset,
  parseTarget,
  parseWhen,
  renderAnswer,
} from '../telegram-bridge.mjs';

describe('parseCommand', () => {
  it('reads the three commands the bridge acts on', () => {
    expect(parseCommand('/task fix the login bug')).toEqual({
      command: 'task',
      args: 'fix the login bug',
    });
    expect(parseCommand('/now fix the login bug')).toEqual({
      command: 'now',
      args: 'fix the login bug',
    });
    expect(parseCommand('/remind in 30m call the bank')).toEqual({
      command: 'remind',
      args: 'in 30m call the bank',
    });
  });

  it('ignores the bot suffix Telegram adds in groups', () => {
    expect(parseCommand('/task@royaraqamia_bot thing').command).toBe('task');
  });

  it('treats an unknown slash as plain text, so a path is not a command', () => {
    expect(parseCommand('/community/fix the header')).toEqual({
      command: null,
      args: '/community/fix the header',
    });
    expect(parseCommand('just a message').command).toBeNull();
  });

  it('returns empty args for a bare command', () => {
    expect(parseCommand('/task')).toEqual({ command: 'task', args: '' });
  });
});

describe('parseTarget', () => {
  it('splits a repository prefix from its task', () => {
    expect(parseTarget('my-site: fix the header')).toEqual({
      repo: 'my-site',
      body: 'fix the header',
    });
  });

  it('reports the prefix even when it is probably prose, and leaves the choice to the caller', () => {
    // `fix:` looks like a prefix; only the caller knows whether `fix` is a repo.
    expect(parseTarget('fix: the login bug')).toEqual({ repo: 'fix', body: 'the login bug' });
  });

  it('keeps a message without a prefix whole', () => {
    expect(parseTarget('https://example.com/a')).toEqual({
      repo: null,
      body: 'https://example.com/a',
    });
  });
});

describe('parseOffset', () => {
  it('reads an hour offset', () => {
    expect(parseOffset('+3')).toEqual({ minutes: 180, name: '+3' });
    expect(parseOffset('-5')).toEqual({ minutes: -300, name: '-5' });
  });

  it('reads a half-hour offset', () => {
    expect(parseOffset('+5:30').minutes).toBe(330);
  });

  it('reads a named zone', () => {
    expect(parseOffset('Asia/Damascus').minutes).toBe(180);
    expect(parseOffset('UTC').minutes).toBe(0);
  });

  it('rejects what is not an offset', () => {
    expect(parseOffset('tonight')).toBeNull();
    expect(parseOffset('+3:99')).toBeNull();
  });
});

describe('formatOffset', () => {
  it('renders signed hours and minutes', () => {
    expect(formatOffset(180)).toBe('+03:00');
    expect(formatOffset(-330)).toBe('-05:30');
    expect(formatOffset(0)).toBe('+00:00');
  });
});

describe('parseWhen', () => {
  const now = Date.parse('2026-11-03T00:00:00Z');

  it('reads a relative delay and keeps the reminder text', () => {
    const parsed = parseWhen('in 30m call the bank', now, 180);
    expect(parsed.at.toISOString()).toBe('2026-11-03T00:30:00.000Z');
    expect(parsed.rest).toBe('call the bank');
  });

  it('reads hours and days', () => {
    expect(parseWhen('in 2h go', now, 180).at.toISOString()).toBe('2026-11-03T02:00:00.000Z');
    expect(parseWhen('in 1d go', now, 180).at.toISOString()).toBe('2026-11-04T00:00:00.000Z');
  });

  it('reads a wall clock in the chat offset', () => {
    // 09:30 at UTC+3 is 06:30 UTC, same day.
    expect(parseWhen('09:30 standup', now, 180).at.toISOString()).toBe('2026-11-03T06:30:00.000Z');
  });

  it('rolls a past wall clock to tomorrow', () => {
    // 00:00 local (21:00Z the day before) has passed; 23:00 local is the next one.
    const late = Date.parse('2026-11-03T12:00:00Z');
    expect(parseWhen('09:30 standup', late, 180).at.toISOString()).toBe('2026-11-04T06:30:00.000Z');
  });

  it('refuses text with no time in it', () => {
    expect(parseWhen('call the bank', now, 180)).toBeNull();
  });
});

describe('chunkMessage', () => {
  it('leaves a short message alone', () => {
    expect(chunkMessage('short')).toEqual(['short']);
  });

  it('splits something longer than Telegram accepts, without losing a line', () => {
    const line = 'x'.repeat(99);
    const text = Array.from({ length: 100 }, () => line).join('\n');
    const chunks = chunkMessage(text);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 4000)).toBe(true);
    expect(chunks.join('\n').replace(/\n/g, '')).toBe(text.replace(/\n/g, ''));
  });

  it('returns one empty chunk for empty input', () => {
    expect(chunkMessage('')).toEqual(['']);
  });
});

describe('formatDigest', () => {
  const runs = [
    { conclusion: 'success', html_url: 'https://example.com/run' },
    { conclusion: 'failure', html_url: 'https://example.com/run2' },
  ];
  const items = [{ number: 12, title: 'Fix the header', html_url: 'https://example.com/12' }];

  it('names the workflow, the counts and the linked items', () => {
    const text = formatDigest({ workflow: 'Issue Planner', runs, items });

    expect(text).toContain('Issue Planner');
    expect(text).toContain('1 ناجح');
    expect(text).toContain('1 فاشل');
    expect(text).toContain('#12');
    expect(text).toContain('Fix the header');
  });

  it('says so when the day was empty rather than printing a bare header', () => {
    const text = formatDigest({ workflow: 'Issue Implementer', runs: [], items: [] });

    expect(text).toContain('لا تشغيلات');
    expect(text).toContain('لا شيء');
  });

  it('escapes HTML in a title, so a merged pull request cannot break the message', () => {
    const text = formatDigest({
      workflow: 'Issue Implementer',
      runs,
      items: [{ number: 1, title: '<b>x</b>', html_url: 'https://example.com/1' }],
    });

    expect(text).toContain('&lt;b&gt;x&lt;/b&gt;');
  });
});

describe('renderAnswer', () => {
  it('turns a backticked command into code, with a direction mark', () => {
    expect(renderAnswer('استخدم `/task` لذلك')).toBe('استخدم <code>\u200E/task</code> لذلك');
  });

  it('escapes HTML before adding tags, so prose about tags is safe', () => {
    expect(renderAnswer('<b>x</b>')).toBe('&lt;b&gt;x&lt;/b&gt;');
  });

  it('leaves plain prose alone', () => {
    expect(renderAnswer('مرحبا، كل شيء بخير.')).toBe('مرحبا، كل شيء بخير.');
  });
});

describe('commandSpan', () => {
  it('keeps a leading slash on the left of the command in an RTL paragraph', () => {
    // Without U+200E the bidi algorithm moves `/` to the visual end (`task/`).
    expect(commandSpan('/task')).toBe('<code>\u200E/task</code>');
  });

  it('escapes the command, so it cannot inject markup', () => {
    expect(commandSpan('<b>')).toBe('<code>\u200E&lt;b&gt;</code>');
  });
});

describe('formatHistory', () => {
  it('labels who said what, in the order it was said', () => {
    const text = formatHistory([
      { direction: 'in', body: 'مرحبا' },
      { direction: 'out', body: 'أهلاً' },
    ]);
    expect(text).toBe('المستخدم: مرحبا\nالمساعد: أهلاً');
  });

  it('drops rows with no text, so a stored command does not break the prompt', () => {
    expect(
      formatHistory([
        { direction: 'out', body: '' },
        { direction: 'in', body: 'x' },
      ])
    ).toBe('المستخدم: x');
  });

  it('is empty for an empty conversation', () => {
    expect(formatHistory([])).toBe('');
  });
});

describe('formatAlert', () => {
  it('names the workflow, the repository and the link', () => {
    const text = formatAlert({
      workflow: 'Migration Drift',
      conclusion: 'failure',
      url: 'https://example.com/run',
      repo: ['royaraqamia', 'royaraqamia'],
    });

    expect(text).toContain('Migration Drift');
    expect(text).toContain('فاشل');
    expect(text).toContain('royaraqamia/royaraqamia');
    expect(text).toContain('https://example.com/run');
  });
});
