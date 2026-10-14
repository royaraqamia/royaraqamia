import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterAll, describe, expect, it } from 'vitest';

import {
  diffMigrations,
  localMigrations,
  localVersions,
  main,
  remoteVersions,
} from '../check-migration-drift.mjs';

const tempDirs = [];

/** A throwaway `supabase/migrations` directory with the given file names. */
function migrationsDir(files) {
  const dir = mkdtempSync(join(tmpdir(), 'drift-'));
  tempDirs.push(dir);
  for (const name of files) writeFileSync(join(dir, name), '-- test\n');
  return dir;
}

const collect = () => {
  const lines = [];
  return { lines, log: (line) => lines.push(String(line)) };
};

const jsonResponse = (payload) => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  json: async () => payload,
  text: async () => JSON.stringify(payload),
});

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe('localMigrations', () => {
  it('reads versions off file names, oldest first, and ignores other files', () => {
    const dir = migrationsDir([
      '20260102000000_second.sql',
      'notes.md',
      '20260101000000_first.sql',
      '.gitkeep',
    ]);

    expect(localMigrations(dir)).toEqual([
      { version: '20260101000000', file: '20260101000000_first.sql' },
      { version: '20260102000000', file: '20260102000000_second.sql' },
    ]);
    expect(localVersions(dir)).toEqual(['20260101000000', '20260102000000']);
  });
});

describe('remoteVersions', () => {
  it('reads the documented { migrations: [...] } payload', () => {
    expect(
      remoteVersions({
        migrations: [{ version: '20260102000000' }, { version: '20260101000000', name: 'a' }],
      })
    ).toEqual(['20260101000000', '20260102000000']);
  });

  it('tolerates a bare array and rows that carry no version', () => {
    expect(
      remoteVersions(['20260101000000', { name: 'no version' }, { version: '20260102000000' }])
    ).toEqual(['20260101000000', '20260102000000']);
  });

  it('returns nothing for a payload it does not recognise, rather than inventing rows', () => {
    expect(remoteVersions(undefined)).toEqual([]);
    expect(remoteVersions({ data: [{ version: '20260101000000' }] })).toEqual([]);
  });
});

describe('diffMigrations', () => {
  const local = ['20260101000000', '20260102000000'];

  it('is clean when both sides name the same versions', () => {
    expect(diffMigrations(local, ['20260102000000', '20260101000000'])).toEqual({
      missingRemotely: [],
      extraRemotely: [],
    });
  });

  it('reports a file the project has not recorded, and a record the repo has no file for', () => {
    expect(diffMigrations(local, ['20260101000000', '20260103000000'])).toEqual({
      missingRemotely: ['20260102000000'],
      extraRemotely: ['20260103000000'],
    });
  });

  it('excuses the versions that are listed as intentional', () => {
    expect(
      diffMigrations(local, ['20260101000000', '20260103000000'], {
        knownLocalOnly: ['20260102000000'],
        knownRemoteOnly: ['20260103000000'],
      })
    ).toEqual({ missingRemotely: [], extraRemotely: [] });
  });
});

describe('main', () => {
  const inSync = migrationsDir(['20260101000000_first.sql']);
  const drifted = migrationsDir(['20260101000000_first.sql', '20260102000000_second.sql']);
  const env = { SUPABASE_ACCESS_TOKEN: 'sbp_test', SUPABASE_PROJECT_REF: 'abcdefghijklmnop' };

  it('skips, without failing, when the repository secrets are absent', async () => {
    const { lines, log } = collect();
    const fetchImpl = () => {
      throw new Error('must not be called');
    };

    expect(await main({ env: {}, log, fetchImpl })).toBe(0);
    expect(lines.join('\n')).toContain('Skipping');
  });

  it('asks the project for its migrations, with the token, and passes when the lists match', async () => {
    const { lines, log } = collect();
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ migrations: [{ version: '20260101000000', name: 'first' }] });
    };

    expect(await main({ env, log, fetchImpl, localDir: inSync })).toBe(0);
    expect(calls).toEqual([
      {
        url: 'https://api.supabase.com/v1/projects/abcdefghijklmnop/database/migrations',
        options: { headers: { Authorization: 'Bearer sbp_test', Accept: 'application/json' } },
      },
    ]);
    expect(lines.join('\n')).toContain('In sync.');
  });

  it('fails and names the file when the project is behind the repo', async () => {
    const { lines, log } = collect();
    const fetchImpl = async () =>
      jsonResponse({ migrations: [{ version: '20260101000000', name: 'first' }] });

    expect(await main({ env, log, fetchImpl, localDir: drifted })).toBe(1);
    const output = lines.join('\n');
    expect(output).toContain('20260102000000_second.sql');
    expect(output).toContain('supabase db push');
  });

  it('fails and names the version when the project is ahead of the repo', async () => {
    const { lines, log } = collect();
    const fetchImpl = async () =>
      jsonResponse({
        migrations: [
          { version: '20260101000000', name: 'first' },
          { version: '20260103000000', name: 'applied_out_of_band' },
        ],
      });

    expect(await main({ env, log, fetchImpl, localDir: inSync })).toBe(1);
    const output = lines.join('\n');
    expect(output).toContain('20260103000000');
    expect(output).toContain('migration repair --status reverted');
  });

  it('fails when the history cannot be read instead of reporting an empty project as in sync', async () => {
    const { lines, log } = collect();
    const refusing = async () => ({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => '{"message":"Invalid authentication credentials"}',
      json: async () => ({}),
    });

    expect(await main({ env, log, fetchImpl: refusing, localDir: inSync })).toBe(1);
    expect(lines.join('\n')).toContain('401 Unauthorized');
  });

  it('refuses to call an empty history "in sync"', async () => {
    const { lines, log } = collect();
    const fetchImpl = async () => jsonResponse({ migrations: [] });

    expect(await main({ env, log, fetchImpl, localDir: inSync })).toBe(1);
    expect(lines.join('\n')).toContain('no recorded migrations at all');
  });
});
