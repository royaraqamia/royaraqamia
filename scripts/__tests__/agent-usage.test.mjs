import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The ledger and the CLI behind it (ADR-0133, issue #1497).
 *
 * Two things made the Go allowance gate inert, and both are shapes rather than
 * policy: a CLI that prints help instead of JSON, and a ledger summed by an
 * aggregate PostgREST refuses. So the fixtures here are the two reports a runner
 * really produces, and the assertions are the numbers a gate has to end up with.
 */

const fixture = vi.hoisted(() => ({
  help: [
    'opencode stats',
    '',
    'show token usage and cost statistics',
    '',
    'Options:',
    '  -h, --help        show help                                              [boolean]',
    '      --days        show stats for the last N days (default: all time)      [number]',
    '      --models      show model statistics (default: hidden)...',
    '',
  ].join('\n'),

  // 1.x `opencode stats`: no machine-readable form, but the dollars are there.
  table: [
    '┌────────────────────────────────────────────────────────┐',
    '│                       OVERVIEW                         │',
    '├────────────────────────────────────────────────────────┤',
    '│Sessions                                               1 │',
    '└────────────────────────────────────────────────────────┘',
    '',
    '┌────────────────────────────────────────────────────────┐',
    '│                    COST & TOKENS                       │',
    '├────────────────────────────────────────────────────────┤',
    '│Total Cost                                         $0.04 │',
    '│Avg Cost/Day                                      $0.04 │',
    '│Input                                            129.1K │',
    '└────────────────────────────────────────────────────────┘',
    '',
  ].join('\n'),

  json: JSON.stringify({ sessions: 1, cost: 0.04, tokens: { input: 129_100 } }),
  spawns: [],
  mode: 'legacy',
}));

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    spawnSync: (_binary, args) => {
      fixture.spawns.push(args.join(' '));
      // 1.x: `--json` is not a flag, so the binary prints its help and exits 1.
      if (fixture.mode === 'legacy') {
        if (args.includes('--json')) return { status: 1, stdout: fixture.help, stderr: '' };
        return { status: 0, stdout: fixture.table, stderr: '' };
      }
      if (args.includes('--json')) return { status: 0, stdout: fixture.json, stderr: '' };
      return { status: 1, stdout: '', stderr: '' };
    },
  };
});

const { allowanceFromTable, allowanceOf, gate, readStats, statsFromText, sumAllowance } =
  await import('../agents/usage.mjs');

describe('the CLI report a 1.x binary gives', () => {
  beforeEach(() => {
    fixture.spawns.length = 0;
    fixture.mode = 'legacy';
  });

  it('reads no stats from the help screen `stats --json` prints, and falls to the table', () => {
    expect(statsFromText(fixture.help)).toBeNull();

    const stats = readStats(process.cwd(), 'opencode');
    expect(allowanceOf(stats)).toBe(0.04);
    // The JSON forms failed first, in that order, and the table answered.
    expect(fixture.spawns).toEqual(['stats --json --project .', 'stats --json', 'stats']);
  });

  it('parses `Total Cost` out of the COST & TOKENS block', () => {
    expect(allowanceFromTable(fixture.table)).toBe(0.04);
  });

  it('reads locale digits and separators, not just ASCII', () => {
    // The table is formatted with the machine's digits: this is `$0.04` printed
    // for an Arabic locale (U+0660, U+066B, U+0660, U+0664), spelled out so that
    // the repository's ASCII-digit rule still holds for this file.
    const arabic = fixture.table.replace('$0.04', '$\u0660\u066b\u0660\u0664');
    expect(allowanceFromTable(arabic)).toBe(0.04);
  });
});

describe('the CLI report a 2.x binary gives', () => {
  beforeEach(() => {
    fixture.spawns.length = 0;
    fixture.mode = 'json';
  });

  it('asks for the current project by id, never by path', () => {
    const stats = readStats(process.cwd(), 'opencode');
    expect(allowanceOf(stats)).toBe(0.04);
    // `--project <absolute path>` is accepted silently and reports zero on 2.x,
    // which would be recorded as a measured zero.
    expect(fixture.spawns[0]).toBe('stats --json --project .');
    expect(fixture.spawns[0]).not.toContain(process.cwd());
  });
});

describe('summing the ledger without an aggregate', () => {
  it('adds the measured rows and leaves the unmeasured ones out', () => {
    const rows = [
      { allowance_usd: 1.25 },
      { allowance_usd: null }, // nobody measured it: unknown, not zero
      { allowance_usd: '0.5' },
      { allowance_usd: null },
      { allowance_usd: 0.25 },
    ];

    expect(sumAllowance(rows)).toEqual({ total: 2, counted: 3, skipped: 2 });
  });

  it('treats an empty window as zero spent, and nothing skipped', () => {
    expect(sumAllowance([])).toEqual({ total: 0, counted: 0, skipped: 0 });
  });
});

describe('the gate reads the ledger as rows', () => {
  const saved = {};
  let dir = '';

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agent-usage-'));
    saved.output = process.env.GITHUB_OUTPUT;
    saved.summary = process.env.GITHUB_STEP_SUMMARY;
    saved.url = process.env.SUPABASE_URL;
    saved.key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    saved.cap = process.env.CAP_5H_USD;

    process.env.GITHUB_OUTPUT = join(dir, 'output');
    delete process.env.GITHUB_STEP_SUMMARY;
    process.env.SUPABASE_URL = 'https://project.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
    process.env.CAP_5H_USD = '0.03';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    rmSync(dir, { recursive: true, force: true });
    for (const [name, value] of [
      ['GITHUB_OUTPUT', saved.output],
      ['GITHUB_STEP_SUMMARY', saved.summary],
      ['SUPABASE_URL', saved.url],
      ['SUPABASE_SERVICE_ROLE_KEY', saved.key],
      ['CAP_5H_USD', saved.cap],
    ]) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  /** `gate`'s outputs, as the later steps read them. */
  const outputs = () => {
    const text = readFileSync(join(dir, 'output'), 'utf8');
    return Object.fromEntries(
      text
        .trim()
        .split('\n')
        .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)])
    );
  };

  it('reports soft once the five-hour total crosses its cap, and skips nulls', async () => {
    const urls = [];
    vi.stubGlobal('fetch', async (url) => {
      urls.push(String(url));
      return {
        ok: true,
        json: async () => [{ allowance_usd: 0.04 }, { allowance_usd: null }],
      };
    });

    await gate();

    const answer = outputs();
    expect(answer.allowance_5h_usd).toBe('0.0400');
    expect(answer.allowance_7d_usd).toBe('0.0400');
    expect(answer.allowance_30d_usd).toBe('0.0400');
    expect(answer.soft).toBe('true');
    expect(answer.reason).toContain('five-hour allowance');

    // Plain rows: an aggregate is refused by this project (PGRST123).
    for (const url of urls) {
      expect(url).not.toContain('.sum(');
      expect(url).toContain('select=allowance_usd');
    }
  });

  it('pages a window instead of stopping at the first thousand rows', async () => {
    vi.stubGlobal('fetch', async (url) => {
      const offset = Number(new URL(url).searchParams.get('offset'));
      if (offset === 0) {
        return {
          ok: true,
          json: async () => Array.from({ length: 1000 }, () => ({ allowance_usd: 0.00004 })),
        };
      }
      return { ok: true, json: async () => [{ allowance_usd: 0 }] };
    });

    await gate();

    // 1000 rows of $0.00004 is $0.04: the second page exists only to prove the
    // read does not end at the PostgREST default.
    expect(outputs().allowance_5h_usd).toBe('0.0400');
  });
});
