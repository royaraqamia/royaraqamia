import { describe, expect, it } from 'vitest';

import {
  chunkMarkdown,
  formatAlert,
  formatDigest,
  formatOffset,
  languageOf,
  parseMemory,
  parseOffset,
  parseWhen,
  pullState,
  renderAnswer,
  stripHtml,
  toLatinDigits,
  unseen,
  withPartNumbers,
} from '../telegram-bridge.mjs';
import { parseForget } from '../telegram/answer.mjs';
import { progressLine } from '../telegram/agent.mjs';
import { decide } from '../telegram/guard-decision.mjs';
import { buildSystemPrompt, failureLine } from '../telegram/prompt.mjs';
import { escapeHtml } from '../telegram/text.mjs';

describe('renderAnswer', () => {
  it('escapes before it formats, so a stray angle bracket is text', () => {
    const html = renderAnswer('اقرأ <script>alert(1)</script> ثم `npm test`');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('<code>');
    expect(html).not.toContain('<script>');
  });

  it('renders bold, links and bullets without inventing tags', () => {
    const html = renderAnswer('**عنوان**\n- نقطة\n[runs](https://github.com/x/y)');
    expect(html).toContain('<b>عنوان</b>');
    expect(html).toContain('• نقطة');
    expect(html).toContain('<a href="https://github.com/x/y">runs</a>');
  });

  it('leaves a fenced block whole, including its markup characters', () => {
    const html = renderAnswer('```ts\nconst a = 1 < 2 && `x`;\n```');
    expect(html).toMatch(/^<pre>[\s\S]*<\/pre>$/);
    expect(html).toContain('&lt;');
    expect(html).not.toContain('<code>');
  });
});

describe('chunkMarkdown', () => {
  it('splits before markup, so every piece has balanced tags', () => {
    const long = Array.from({ length: 80 }, (_, index) => `**سطر ${index}** نص طويل هنا`).join(
      '\n'
    );
    const chunks = chunkMarkdown(long, 400);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      const html = renderAnswer(chunk);
      const open = (html.match(/<b>/g) ?? []).length;
      const close = (html.match(/<\/b>/g) ?? []).length;
      expect(open).toBe(close);
    }
  });

  it('closes and reopens a fence that lands across the boundary', () => {
    const code = Array.from({ length: 40 }, (_, index) => `const value${index} = ${index};`).join(
      '\n'
    );
    const chunks = chunkMarkdown('قبل\n```ts\n' + code + '\n```\nبعد', 200);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect((chunk.match(/```/g) ?? []).length % 2).toBe(0);
    }
  });

  it('cuts a single enormous line instead of returning it whole', () => {
    const chunks = chunkMarkdown('كلمة '.repeat(5000), 1000);
    expect(chunks.every((chunk) => chunk.length <= 1000)).toBe(true);
  });

  it('numbers the pieces only when there is more than one', () => {
    expect(withPartNumbers(['one'])).toEqual(['one']);
    const numbered = withPartNumbers(['a\nb', 'c\nd']);
    expect(numbered[0]).toContain('(1/2)');
    expect(numbered[1]).toContain('(2/2)');
  });
});

describe('languageOf', () => {
  it('mirrors the language of the message', () => {
    expect(languageOf('fix the login page')).toBe('en');
    expect(languageOf('أصلح صفحة الدخول')).toBe('ar');
  });

  it('ignores file names, paths and code spans, which are names not prose', () => {
    expect(languageOf('اقرأ AGENTS.md واذكر أول قاعدتين في العقد')).toBe('ar');
    expect(languageOf('اقرأ `package.json` وأخبرني بالإصدار')).toBe('ar');
    expect(languageOf('read scripts/telegram/answer.mjs and explain it')).toBe('en');
  });

  it('follows the first sentence of a mixed message', () => {
    expect(languageOf('fix the login page. أيضاً أضف زراً')).toBe('en');
    expect(languageOf('أصلح صفحة الدخول. Also add a button')).toBe('ar');
  });

  it('answers Arabic for a message with no letters at all', () => {
    expect(languageOf('123')).toBe('ar');
    expect(languageOf('?!')).toBe('ar');
  });
});

describe('time parsing', () => {
  const now = Date.parse('2026-11-04T12:00:00Z');

  it('reads Arabic durations, with Arabic-Indic digits', () => {
    expect(parseWhen('بعد \u0663\u0660 دقيقة اتصل', now, 180)?.rest).toBe('اتصل');
    expect(parseWhen('بعد نصف ساعة اتصل', now, 180)?.at.toISOString()).toBe(
      new Date(now + 30 * 60_000).toISOString()
    );
    expect(parseWhen('بعد ساعتين اتصل', now, 180)?.at.toISOString()).toBe(
      new Date(now + 120 * 60_000).toISOString()
    );
    expect(parseWhen('بعد يومين اتصل', now, 180)?.at.toISOString()).toBe(
      new Date(now + 2880 * 60_000).toISOString()
    );
  });

  it('reads the English forms the help used to document', () => {
    expect(parseWhen('in 30m call the bank', now, 180)?.rest).toBe('call the bank');
    expect(parseWhen('in 2h review', now, 180)?.at.toISOString()).toBe(
      new Date(now + 2 * 3_600_000).toISOString()
    );
  });

  it('reads a wall clock in the chat offset and moves it to tomorrow when past', () => {
    // 12:00 UTC is 15:00 in +03:00, so 09:30 has already passed and means tomorrow.
    const when = parseWhen('09:30 صباحاً', now, 180);
    expect(when?.at.toISOString()).toBe('2026-11-05T06:30:00.000Z');
    const later = parseWhen('18:00 مساءً', now, 180);
    expect(later?.at.toISOString()).toBe('2026-11-04T15:00:00.000Z');
  });

  it('reads offsets in Arabic and Latin', () => {
    expect(parseOffset('+3')).toEqual({ minutes: 180, name: '+3' });
    expect(parseOffset('دمشق')?.minutes).toBe(180);
    expect(parseOffset('-5.5')).toBeNull();
    expect(formatOffset(-90)).toBe('-01:30');
  });

  it('normalises Arabic-Indic digits', () => {
    expect(toLatinDigits('\u0663\u0660 دقيقة')).toBe('30 دقيقة');
    expect(toLatinDigits('\u06f1\u06f2\u06f3')).toBe('123');
  });
});

describe('parseMemory', () => {
  it('reads a fenced JSON answer', () => {
    const { summary, memories } = parseMemory(
      '```json\n{"summary":"ملخص","memories":[{"kind":"preference","content":"يحب الفصحى"}]}\n```'
    );
    expect(summary).toBe('ملخص');
    expect(memories).toEqual([{ kind: 'preference', content: 'يحب الفصحى' }]);
  });

  it('invents nothing when the answer is not JSON', () => {
    expect(parseMemory('لم أفهم')).toEqual({ summary: '', memories: [] });
  });

  it('drops a kind it does not know and caps the list', () => {
    const memories = Array.from({ length: 9 }, (_, index) => ({
      kind: 'nonsense',
      content: `fact number ${index}`,
    }));
    const parsed = parseMemory(JSON.stringify({ summary: 's', memories }));
    expect(parsed.memories).toHaveLength(6);
    expect(parsed.memories[0].kind).toBe('fact');
  });
});

describe('stripHtml', () => {
  it('turns a stored answer back into prose the model can read', () => {
    expect(stripHtml('📥 سجّلت <a href="https://x">#1043</a> في <code>royaraqamia</code>')).toBe(
      '📥 سجّلت #1043 في royaraqamia'
    );
  });

  it('unwraps entities rather than teaching the model to quote them', () => {
    expect(stripHtml('&quot;body&quot; &amp; &lt;x&gt;')).toBe('"body" & <x>');
  });
});

describe('the branch name', () => {
  it('is ASCII, so it survives a URL, a ref and a log', async () => {
    const { slug } = await import('../telegram/publish.mjs');
    expect(slug('أنشئ ملف docs/telegram-smoke-test.md فيه سطر')).toBe(
      'docs-telegram-smoke-test-md'
    );
    expect(slug('fix the login page')).toBe('fix-the-login-page');
    expect(slug('!!!')).toBe('change');
  });
});

describe('the commit title', () => {
  const title = (line, files = ['scripts/telegram/publish.mjs']) =>
    import('../telegram/publish.mjs').then(({ conventionalTitle }) =>
      conventionalTitle({
        request: 'نظّف مفتاح update_offset الميت من telegram_state',
        answer: 'حذفت المفتاح',
        files,
        ask: async () => ({ content: line }),
      })
    );

  it('accepts a conventional line', async () => {
    expect(await title('chore(db): drop the dead telegram poll offset')).toBe(
      'chore(db): drop the dead telegram poll offset'
    );
  });

  it('strips a bullet, a backtick and a trailing full stop', async () => {
    expect(await title('- `fix(telegram): keep the answer in one chunk`.')).toBe(
      'fix(telegram): keep the answer in one chunk'
    );
  });

  it('rejects an Arabic title, a bare sentence and an unknown type', async () => {
    const fallback = 'chore(telegram): apply a change requested from the chat';
    expect(await title('نظّف مفتاح update_offset')).toBe(fallback);
    expect(await title('Clean up the telegram state table')).toBe(fallback);
    expect(await title('update: cleanup')).toBe(fallback);
  });

  it('falls back by area when the model fails', async () => {
    const { conventionalTitle } = await import('../telegram/publish.mjs');
    const failing = {
      request: 'x',
      answer: 'y',
      files: ['supabase/migrations/20261114130000_x.sql'],
      ask: async () => {
        throw new Error('gateway down');
      },
    };
    expect(await conventionalTitle(failing)).toBe('chore(db): apply a migration');
    expect(await conventionalTitle({ ...failing, files: ['docs/agents/telegram.md'] })).toBe(
      'docs: update agents-telegram'
    );
  });
});

describe('safeFileName', () => {
  it('keeps the last segment and never lets a path decide where a file lands', async () => {
    const { safeFileName } = await import('../telegram/text.mjs');
    expect(safeFileName('voice/file_1.oga')).toBe('file_1.oga');
    expect(safeFileName('../../etc/passwd')).toBe('passwd');
    expect(safeFileName('..')).toBe('file');
    expect(safeFileName('a b:c?.jpg')).toBe('a_b_c_.jpg');
    expect(safeFileName('')).toBe('file');
  });
});

describe('parseForget', () => {
  it('accepts the short sentence it documents', () => {
    expect(parseForget('احذف رقم 3')).toBe(3);
    expect(parseForget('forget memory 12')).toBe(12);
  });
  it('refuses anything that is not that sentence', () => {
    expect(parseForget('احذف رقم 3 ثم أعد تشغيل الاختبارات وشغّل الفحص الكامل')).toBeNull();
    expect(parseForget('delete everything')).toBeNull();
  });
});

describe('the guard rails', () => {
  it('refuses the writes a message must not make', () => {
    expect(decide('git', ['push', 'origin', 'main']).allow).toBe(false);
    expect(decide('git', ['commit', '-m', 'x']).allow).toBe(false);
    expect(decide('gh', ['pr', 'merge', '12']).allow).toBe(false);
    expect(decide('vercel', ['deploy', '--prod']).allow).toBe(false);
    expect(decide('git', ['clean', '-fd']).allow).toBe(false);
  });

  it('leaves the reads alone', () => {
    expect(decide('git', ['log', '--oneline', '-5']).allow).toBe(true);
    expect(decide('git', ['diff']).allow).toBe(true);
    expect(decide('gh', ['pr', 'view', '12']).allow).toBe(true);
    expect(decide('vercel', ['ls']).allow).toBe(true);
    expect(decide('vercel', ['deploy']).allow).toBe(true);
  });
});

describe('the prompt', () => {
  it('states the language rule, the tool rule and the confirmation rule', () => {
    const prompt = buildSystemPrompt({
      tz: { offsetMinutes: 180, formatted: '+03:00' },
      now: new Date('2026-11-04T12:00:00Z'),
      runUrl: 'https://github.com/x/y/actions/runs/1',
    });

    expect(prompt).toContain('فصحى');
    expect(prompt).toContain('بلا لهجة');
    expect(prompt).toContain('لا تقل إنك قرأت شيئاً لم تقرأه');
    expect(prompt).toContain('لا تدمج في main');
    expect(prompt).toContain('UTC+03:00');
  });

  it('gives a failure a reference instead of the provider text', () => {
    const line = failureLine('a1b2c3d4');
    expect(line).toContain('a1b2c3d4');
    expect(line).not.toContain('Supabase');
    expect(line).not.toContain('null');
  });
});

describe('progressLine', () => {
  it('names the work in Arabic', () => {
    expect(
      progressLine({ type: 'tool', tool: 'read', state: { input: { path: 'a/b/config.mjs' } } })
    ).toBe('أقرأ config.mjs…');
    expect(progressLine({ type: 'tool', tool: 'grep', state: { input: {} } })).toBe(
      'أبحث في المستودع…'
    );
    expect(
      progressLine({ type: 'tool', tool: 'bash', state: { input: { command: 'npm run lint' } } })
    ).toBe('أشغّل npm run…');
  });

  it('falls back rather than throwing on an unknown tool', () => {
    expect(progressLine({ type: 'tool', tool: 'mcp__supabase__query', state: {} })).toContain(
      'قاعدة البيانات'
    );
    expect(progressLine({ type: 'text' })).toBe('');
  });
});

describe('digest and alert text', () => {
  it('is the heading and only the lines given, with no run status', () => {
    const text = formatDigest({
      workflow: 'Issue Planner',
      items: [{ number: 7, html_url: 'https://x/7', title: 'عنوان' }],
      // The old renderer read these; passing them is how the shape is pinned.
      runs: [{ conclusion: 'failure', html_url: 'https://x/run' }],
      url: 'https://x/run',
    });
    expect(text).toContain('Issue Planner');
    expect(text).toContain('#7');
    expect(text).not.toContain('ناجح');
    expect(text).not.toContain('فاشل');
    expect(text).not.toContain('آخر 24 ساعة');
    expect(text).not.toContain('https://x/run');
  });

  it('labels a pull that did not merge, so the line stays true', () => {
    const open = formatDigest({
      workflow: 'Issue Implementer',
      items: [{ number: 9, html_url: 'https://x/9', title: 'مفتوح', state: 'open' }],
    });
    const closed = formatDigest({
      workflow: 'Issue Implementer',
      items: [{ number: 10, html_url: 'https://x/10', title: 'مغلق', state: 'closed' }],
    });
    expect(open).toContain('مفتوح');
    expect(closed).toContain('مغلق');
  });

  it('names the workflow and the repo in an alert', () => {
    const text = formatAlert({
      workflow: 'Migration Drift',
      conclusion: 'failure',
      url: 'https://x/run',
      repo: 'royaraqamia/royaraqamia',
    });
    expect(text).toContain('Migration Drift');
    expect(text).toContain('فاشل');
  });
});

describe('what a digest has already reported', () => {
  const now = Date.parse('2026-11-06T22:00:00Z');

  it('reports a pull once per state, never once per digest', () => {
    const merged = {
      kind: 'pull',
      number: 42,
      state: 'merged',
      title: 'x',
      html_url: 'https://x/42',
    };
    const seen = new Set(['pull:42:merged']);
    expect(unseen([merged], seen)).toEqual([]);
    expect(unseen([{ ...merged, state: 'open' }], seen)).toHaveLength(1);
    expect(unseen([merged], new Set())).toEqual([merged]);
  });

  it('gives a just-opened pull its half hour before calling it stuck', () => {
    const opened = { state: 'open', created_at: new Date(now - 10 * 60 * 1000).toISOString() };
    const waiting = { state: 'open', created_at: new Date(now - 45 * 60 * 1000).toISOString() };
    expect(pullState(opened, now)).toBeNull();
    expect(pullState(waiting, now)).toBe('open');
  });

  it('treats a merge and an abandoned close as final states', () => {
    expect(pullState({ state: 'closed', merged_at: '2026-11-06T21:00:00Z' }, now)).toBe('merged');
    expect(pullState({ state: 'closed', merged_at: null }, now)).toBe('closed');
  });
});

describe('escapeHtml', () => {
  it('escapes both quotes so an attribute cannot be closed', () => {
    expect(escapeHtml('<a href="x" onclick=\'y\'>')).toBe(
      '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;'
    );
  });
});
